import { useState, useEffect } from 'react';
import { PreviewFrame } from './components/PreviewFrame';

export default function App() {
  const [files, setFiles] = useState({});
  const [projectId] = useState(`project-${Date.now()}`);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState({ activeWorkers: 0, podIp: 'N/A' });
  const [bootTime, setBootTime] = useState(null);
  const [startTime, setStartTime] = useState(null);

  const apiBase = import.meta.env.VITE_WORKER_URL ||
    (window.location.hostname === 'localhost' ? 'http://localhost:30001' : window.location.origin);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${apiBase}/api/preview/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Stats error:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const handleGenerateNext = async () => {
    setIsGenerating(true);
    setStartTime(Date.now());
    setBootTime(null);

    try {
      // Backend API (AI code generation)
      const apiUrl =
        import.meta.env.VITE_API_URL || 'http://localhost:3000';

      const res = await fetch(`${apiUrl}/next-code`);

      if (!res.ok) {
        throw new Error('Failed to generate code');
      }

      const data = await res.json();

      setFiles(data.files || data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreviewReady = () => {
    if (startTime) {
      const duration = (Date.now() - startTime) / 1000;
      setBootTime(duration.toFixed(2));
    }
  };

  return (
    <div className="grid grid-cols-2 h-screen overflow-hidden">
      {/* Left Panel */}
      <div className="p-8 bg-slate-50 flex flex-col items-start gap-6 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            AI Studio Preview
          </h1>
          <p className="text-slate-500 text-xs font-mono font-bold tracking-widest uppercase">
            ID: {projectId}
          </p>
          <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
            Generate high-performance Next.js previews in seconds using Kubernetes-orchestrated workers.
          </p>
        </div>

        <div className="w-full grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Workers</p>
            <p className="text-2xl font-mono font-bold text-blue-600">{stats.activeWorkers}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Load Time</p>
            <p className="text-2xl font-mono font-bold text-purple-600">{bootTime ? `${bootTime}s` : '--'}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 truncate">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Pod</p>
            <p className="text-lg font-mono font-bold text-green-600 truncate">{stats.podIp}</p>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleGenerateNext}
            className="group relative px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2 overflow-hidden"
            disabled={isGenerating}
          >
            {isGenerating && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            <span className="relative z-10">
              {isGenerating ? 'Generating...' : 'Generate Next.js Demo'}
            </span>
          </button>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-200 w-full text-center">
          <p className="text-[11px] text-slate-400 font-medium tracking-wide uppercase">
            Powered by Kubernetes & Redis
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="bg-slate-100 p-4">
        <PreviewFrame
          projectId={projectId}
          files={files}
          apiBase={apiBase}
          onReady={handlePreviewReady}
          className="rounded-xl shadow-2xl overflow-hidden h-full"
        />
      </div>
    </div>
  );
}