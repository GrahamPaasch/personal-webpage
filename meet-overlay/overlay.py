#!/usr/bin/env python3
"""
meet-overlay — transparent annotation overlay for grahampaasch.com/meet

Joins a Meet room as a silent observer and draws incoming annotations
as a fullscreen transparent always-on-top window directly over your desktop.
Your work stays visible underneath; annotations appear right on top.

Usage:
  python overlay.py --room ROOM_NAME --username YOUR_NAME

Requirements:
  pip install -r requirements.txt
  (Linux also needs: sudo apt install python3-tk)
"""

import argparse
import asyncio
import json
import platform
import sys
import threading
import tkinter as tk
import urllib.request
import urllib.error

try:
    from livekit import rtc
except ImportError:
    print("ERROR: livekit package not found. Run: pip install -r requirements.txt")
    sys.exit(1)

API_BASE = "https://www.grahampaasch.com"
OS = platform.system()  # "Windows", "Darwin", "Linux"


# ── Annotation store ────────────────────────────────────────────────────
class AnnotationStore:
    def __init__(self):
        self.strokes: dict[str, dict] = {}  # id → {color, points[(x,y)]}

    def handle(self, msg: dict):
        t = msg.get("type")
        if t == "clear":
            self.strokes.clear()
            return True  # signal full redraw
        if t == "start":
            self.strokes[msg["id"]] = {"color": msg["color"], "points": [(msg["x"], msg["y"])]}
        elif t == "point":
            stroke = self.strokes.get(msg["id"])
            if stroke:
                stroke["points"].append((msg["x"], msg["y"]))
        elif t == "end":
            pass  # stroke already tracked
        return False


# ── Overlay window ──────────────────────────────────────────────────────
class OverlayWindow:
    def __init__(self, store: AnnotationStore):
        self.store = store
        self.root = tk.Tk()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.sw = sw
        self.sh = sh

        self.root.geometry(f"{sw}x{sh}+0+0")
        self.root.overrideredirect(True)
        self.root.wm_attributes("-topmost", True)

        # Platform transparency setup
        if OS == "Windows":
            # #000001 is the transparent "punch-through" color
            self.TRANSPARENT_COLOR = "#000001"
            self.root.wm_attributes("-transparentcolor", self.TRANSPARENT_COLOR)
            self.root.configure(bg=self.TRANSPARENT_COLOR)
        elif OS == "Darwin":  # macOS
            self.TRANSPARENT_COLOR = "systemTransparent"
            self.root.wm_attributes("-transparent", True)
            self.root.configure(bg="black")
            self.root.wm_attributes("-alpha", 0.0)
        else:  # Linux
            # True punch-through isn't universally available; use near-invisible alpha
            self.TRANSPARENT_COLOR = "#010101"
            try:
                self.root.wm_attributes("-alpha", 0.01)
            except Exception:
                pass
            self.root.configure(bg=self.TRANSPARENT_COLOR)

        self.canvas = tk.Canvas(
            self.root,
            width=sw,
            height=sh,
            bg=self.TRANSPARENT_COLOR if OS != "Darwin" else "black",
            highlightthickness=0,
            bd=0,
        )
        if OS == "Darwin":
            self.canvas.configure(bg="black")
        self.canvas.pack()

        # Make window click-through on Windows
        if OS == "Windows":
            self._set_clickthrough()

        # Status label (top-right corner)
        self.status_label = tk.Label(
            self.root,
            text="● Annotation overlay — connecting…",
            fg="#facc15",
            bg="#1a1a1a",
            font=("Helvetica", 11),
            padx=8, pady=4,
        )
        self.status_label.place(relx=1.0, rely=0.0, anchor="ne", x=-8, y=8)

        # Quit on Escape
        self.root.bind("<Escape>", lambda _: self.root.destroy())

    def _set_clickthrough(self):
        """Windows only: make the window pass mouse events to underlying apps."""
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "")
            GWL_EXSTYLE = -20
            WS_EX_LAYERED = 0x80000
            WS_EX_TRANSPARENT = 0x20
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TRANSPARENT)
        except Exception:
            pass

    def set_status(self, text: str, color: str = "#facc15"):
        def _update():
            self.status_label.config(text=text, fg=color)
        self.root.after(0, _update)

    def redraw(self):
        def _draw():
            self.canvas.delete("all")
            for stroke in self.store.strokes.values():
                pts = stroke["points"]
                color = stroke["color"]
                if len(pts) < 2:
                    # single dot
                    x, y = pts[0]
                    px, py = x * self.sw, y * self.sh
                    self.canvas.create_oval(px - 3, py - 3, px + 3, py + 3, fill=color, outline=color)
                    continue
                for i in range(1, len(pts)):
                    x0, y0 = pts[i - 1][0] * self.sw, pts[i - 1][1] * self.sh
                    x1, y1 = pts[i][0] * self.sw, pts[i][1] * self.sh
                    self.canvas.create_line(x0, y0, x1, y1, fill=color, width=3, capstyle=tk.ROUND, joinstyle=tk.ROUND)
        self.root.after(0, _draw)

    def run(self):
        self.root.mainloop()


# ── LiveKit connection ──────────────────────────────────────────────────
async def livekit_loop(room_name: str, username: str, overlay: OverlayWindow, store: AnnotationStore):
    # Fetch token + server URL from the Meet API
    overlay.set_status("● Fetching token…", "#facc15")
    try:
        payload = json.dumps({"room": room_name, "username": username}).encode()
        req = urllib.request.Request(
            f"{API_BASE}/api/meet/token",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        token = data["token"]
        server_url = data.get("serverUrl", "")
    except (urllib.error.URLError, KeyError) as e:
        overlay.set_status(f"✗ Token error: {e}", "#ef4444")
        return

    if not server_url:
        overlay.set_status("✗ Server URL missing — check API config", "#ef4444")
        return

    room = rtc.Room()

    @room.on("data_received")
    def on_data(data_packet: rtc.DataPacket):
        try:
            raw = bytes(data_packet.data).decode("utf-8")
            msg = json.loads(raw)
            if not msg.get("_ann"):
                return
            need_full_redraw = store.handle(msg)
            overlay.redraw()
            if need_full_redraw:
                overlay.set_status("● Live — annotations cleared", "#22c55e")
        except Exception:
            pass

    @room.on("disconnected")
    def on_disconnected(reason=None):
        overlay.set_status("✗ Disconnected", "#ef4444")

    try:
        overlay.set_status("● Connecting to room…", "#facc15")
        await room.connect(
            server_url,
            token,
            options=rtc.RoomOptions(auto_subscribe=True),
        )
        overlay.set_status(f"● Live — room: {room_name}", "#22c55e")

        # Keep alive until window closes
        while True:
            await asyncio.sleep(1)

    except Exception as e:
        overlay.set_status(f"✗ Connection failed: {e}", "#ef4444")
    finally:
        await room.disconnect()


# ── Entry point ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Meet annotation overlay")
    parser.add_argument("--room", required=True, help="Room name to join")
    parser.add_argument("--username", required=True, help="Your display name")
    args = parser.parse_args()

    store = AnnotationStore()
    overlay = OverlayWindow(store)

    # Run LiveKit loop in a background thread
    def run_async():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            livekit_loop(args.room, args.username, overlay, store)
        )

    thread = threading.Thread(target=run_async, daemon=True)
    thread.start()

    print(f"Overlay running for room '{args.room}' as '{args.username}'")
    print("Press Escape or close the terminal to exit.")
    overlay.run()


if __name__ == "__main__":
    main()
