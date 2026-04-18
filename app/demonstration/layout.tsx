export const dynamic = 'force-dynamic';

export default function DemonstrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  {/* Local AI Coding Showcase */}
  <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
      <h2 className="text-2xl font-bold text-white mb-4">Built Locally</h2>
      <p className="text-gray-300 mb-6">
        This update was coded entirely with Aider using local models on my machine—no cloud servers, just my laptop and a coffee.
      </p>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-gray-700/50 rounded-lg">
          <span className="text-purple-400 text-xl mb-2">💡</span>
          <p className="text-gray-300 text-sm">Think locally</p>
        </div>
        <div className="text-center p-3 bg-gray-700/50 rounded-lg">
          <span className="text-purple-400 text-xl mb-2">💻</span>
          <p className="text-gray-300 text-sm">Code locally</p>
        </div>
        <div className="text-center p-3 bg-gray-700/50 rounded-lg">
          <span className="text-purple-400 text-xl mb-2">⚙️</span>
          <p className="text-gray-300 text-sm">Automate locally</p>
        </div>
      </div>
      <a href="/ai" className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors">
        Explore AI Experience
      </a>
    </div>
  </div>
  return <>{children}</>;
}
