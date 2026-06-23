import Phaser from 'phaser';

const TAGLINES = [
  'Flatten the curve... with your fists!',
  'The only peer-reviewed beatdown simulator!',
  'FDA approved for ages 18+',
  'Side effects may include: winning',
  'Not available on the Joe Rogan Experience',
  'As seen on PubMed (citation pending)',
  'Double-blind, double-fisted!',
  'Funded by Big Pharma (we wish)',
  'No essential oils were harmed in the making of this game',
  'Now with 99.9% fewer microchips',
  'Ask your doctor if rage is right for you',
  'Two weeks to flatten the comment section',
  'Results may vary (they will not)',
  'Sponsored by Big Fist',
];

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  preload() {
    const baseUrl = import.meta.env.BASE_URL;
    this.load.image('background', `${baseUrl}assets/background.png`);
  }

  create() {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.image(width / 2, height / 2, 'background');
    bg.setDisplaySize(width, height);
    bg.setDepth(-100);

    // Dark overlay for readability
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    overlay.setDepth(0);

    // Title text
    const title = this.add.text(width / 2, height * 0.22, 'SIDEWALKS\nOF RAGE', {
      fontFamily: 'Verdana',
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
      lineSpacing: 4
    });
    title.setOrigin(0.5, 0.5);
    title.setDepth(10);

    // Pulsing title effect
    this.tweens.add({
      targets: title,
      scale: 1.03,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });

    // Subtitle
    const subtitle = this.add.text(width / 2, height * 0.42, 'A Dr. Fauci Beat-\'Em-Up', {
      fontFamily: 'Verdana',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    subtitle.setOrigin(0.5, 0.5);
    subtitle.setDepth(10);

    // Tagline (random)
    const tagline = Phaser.Utils.Array.GetRandom(TAGLINES);
    const taglineText = this.add.text(width / 2, height * 0.50, tagline, {
      fontFamily: 'Verdana',
      fontSize: '13px',
      fontStyle: 'italic',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 2
    });
    taglineText.setOrigin(0.5, 0.5);
    taglineText.setDepth(10);

    // Controls info
    const controlsText = [
      'WASD / Arrow Keys — Move',
      'SPACE — Attack',
      'SHIFT — Jump',
    ].join('\n');

    const controls = this.add.text(width / 2, height * 0.65, controlsText, {
      fontFamily: 'Verdana',
      fontSize: '14px',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      lineSpacing: 6
    });
    controls.setOrigin(0.5, 0.5);
    controls.setDepth(10);

    // Start prompt
    const startText = this.add.text(width / 2, height * 0.82, 'PRESS SPACE OR TAP TO START', {
      fontFamily: 'Verdana',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    });
    startText.setOrigin(0.5, 0.5);
    startText.setDepth(10);

    // Blinking start text
    this.tweens.add({
      targets: startText,
      alpha: 0.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });

    // Credit
    const credit = this.add.text(width / 2, height * 0.94, 'A Graham Paasch Production', {
      fontFamily: 'Verdana',
      fontSize: '11px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 2
    });
    credit.setOrigin(0.5, 0.5);
    credit.setDepth(10);

    // Input handlers
    this.input.keyboard.once('keydown-SPACE', () => {
      this.startGame();
    });

    this.input.once('pointerdown', () => {
      this.startGame();
    });

    // Also allow Enter key
    this.input.keyboard.once('keydown-ENTER', () => {
      this.startGame();
    });
  }

  startGame() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
}
