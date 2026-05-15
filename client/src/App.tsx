import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Search, 
  Download, 
  Trash2, 
  Terminal as TerminalIcon, 
  Film, 
  Tv, 
  Settings,
  Play,
  CheckCircle,
  AlertCircle,
  Menu,
  X
} from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:3001/api`;
const socket = io(`http://${window.location.hostname}:3001`);

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [service, setService] = useState('Sonarr');
  const [searchResults, setSearchResults] = useState([]);
  const [library, setLibrary] = useState([]);
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<Record<string, { status: string; progress?: string }>>({});
  
  // Scrape state for TV
  const [season, setSeason] = useState('1');
  const [epStart, setEpStart] = useState('1');
  const [epEnd, setEpEnd] = useState('1');

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConfig();
    fetchQueue();

    socket.on('log', (message) => {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    });

    socket.on('queueUpdated', () => {
      fetchQueue();
    });

    socket.on('downloadStarted', ({ fileName }) => {
      setActiveDownloads(prev => ({ ...prev, [fileName]: { status: 'downloading' } }));
    });

    socket.on('downloadFinished', ({ fileName, status }) => {
      setActiveDownloads(prev => {
        const next = { ...prev };
        if (status === 'SUCCESS') {
          delete next[fileName];
        } else {
          next[fileName] = { status: 'failed' };
        }
        return next;
      });
    });

    return () => {
      socket.off('log');
      socket.off('queueUpdated');
      socket.off('downloadStarted');
      socket.off('downloadFinished');
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (activeTab === 'library') {
      fetchLibrary();
    }
  }, [activeTab, service]);

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE}/config`);
      setConfig(res.data);
    } catch (e) {}
  };

  const fetchLibrary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/media/library`, {
        params: { service }
      });
      setLibrary(res.data);
    } catch (e) {}
  };

  const fetchQueue = async () => {
    try {
      const res = await axios.get(`${API_BASE}/queue`);
      setQueue(res.data);
    } catch (e) {}
  };

  const handleSearch = async () => {
    try {
      const res = await axios.get(`${API_BASE}/media/search`, {
        params: { term: searchTerm, service }
      });
      setSearchResults(res.data);
    } catch (e) {}
  };

  const addToLibrary = async (item: any) => {
    try {
      await axios.post(`${API_BASE}/media/add`, { service, item });
      setLogs(prev => [...prev, `Added ${item.title} to ${service}`]);
    } catch (e) {}
  };

  const triggerScrape = async (items: any[]) => {
    setIsScraping(true);
    try {
      await axios.post(`${API_BASE}/bridge/scrape`, {
        items,
        isMovie: service === 'Radarr',
        season,
        epStart,
        epEnd,
        service
      });
    } catch (e) {}
    setIsScraping(false);
  };

  const triggerIngest = async () => {
    setIsIngesting(true);
    try {
      await axios.post(`${API_BASE}/ingest/start`);
    } catch (e) {}
    setIsIngesting(false);
  };

  const triggerScan = async () => {
    try {
      await axios.post(`${API_BASE}/media/scan`, { service });
      setLogs(prev => [...prev, `[SYSTEM] Manual scan triggered for ${service}`]);
    } catch (e) {}
  };

  const clearQueue = async () => {
    try {
      await axios.post(`${API_BASE}/queue/clear`);
      fetchQueue();
    } catch (e) {}
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden" 
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:relative z-50 lg:z-auto h-full w-64 bg-slate-800 flex flex-col border-r border-slate-700 transition-transform duration-300
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
              <Download size={28} /> OmniGate
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">Dashboard</p>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setIsMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {[
            { id: 'search', label: 'Search', icon: Search },
            { id: 'library', label: 'Library', icon: Film },
            { id: 'queue', label: 'Queue', icon: Download, count: queue.length },
            { id: 'downloads', label: 'Downloads', icon: Play, count: Object.keys(activeDownloads).length },
            { id: 'console', label: 'Console', icon: TerminalIcon },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-700 text-slate-400'}`}
            >
              <item.icon size={20} /> {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${item.id === 'queue' ? 'bg-blue-400 text-blue-900' : 'bg-green-400 text-green-900'}`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 hidden lg:block">
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
              <Settings size={14} /> SYSTEM STATUS
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Sonarr API</span>
                <span className={config?.Sonarr ? "text-green-500" : "text-red-500"}>● Connected</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Radarr API</span>
                <span className={config?.Radarr ? "text-green-500" : "text-red-500"}>● Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-3 lg:gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white"
              onClick={() => setIsMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-medium capitalize truncate">{activeTab}</h2>
            <div className="hidden sm:flex items-center gap-2">
              {isScraping && <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full border border-yellow-500/20 animate-pulse">Scraping...</span>}
              {isIngesting && <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full border border-green-500/20 animate-pulse">Ingesting...</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={triggerScan}
              title={`Scan ${service}`}
              className="p-2 lg:px-4 lg:py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition flex items-center gap-2"
            >
              <Search size={16} /> <span className="hidden sm:inline text-sm font-medium">Scan</span>
            </button>
            <button 
              onClick={triggerIngest}
              disabled={queue.length === 0 || isIngesting}
              className="p-2 lg:px-4 lg:py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-md transition flex items-center gap-2"
            >
              <Download size={18} /> <span className="hidden sm:inline font-medium text-sm">Ingest</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {activeTab === 'search' && (
            <div className="max-w-6xl mx-auto space-y-6 lg:space-y-8">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                  <input 
                    type="text" 
                    placeholder="Search media..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm sm:text-base"
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    className="flex-1 sm:flex-none bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="Sonarr">TV</option>
                    <option value="Radarr">Movies</option>
                  </select>
                  <button 
                    onClick={handleSearch}
                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition text-sm"
                  >
                    Search
                  </button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                  {searchResults.map((item: any) => {
                    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl;
                    const posterUrl = poster ? `${API_BASE}/media/poster?url=${encodeURIComponent(poster)}` : null;

                    return (
                      <div key={item.tmdbId || item.tvdbId} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-500 transition group">
                        <div className="aspect-[2/3] bg-slate-700 relative flex items-center justify-center">
                          {posterUrl ? (
                            <img src={posterUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <Film className="text-slate-600" size={48} />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60"></div>
                          <div className="absolute bottom-4 left-4 right-4">
                            <h3 className="font-bold text-lg leading-tight truncate">{item.title}</h3>
                            <p className="text-slate-400 text-sm">{item.year}</p>
                          </div>
                        </div>
                        <div className="p-4 space-y-4">
                          {service === 'Sonarr' && (
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <label className="text-slate-500 block mb-1">Season</label>
                                <input type="number" value={season} onChange={e => setSeason(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                              </div>
                              <div>
                                <label className="text-slate-500 block mb-1">Start</label>
                                <input type="number" value={epStart} onChange={e => setEpStart(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                              </div>
                              <div>
                                <label className="text-slate-500 block mb-1">End</label>
                                <input type="number" value={epEnd} onChange={e => setEpEnd(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button 
                              onClick={() => addToLibrary(item)}
                              className="flex-1 bg-slate-700 hover:bg-slate-600 text-xs font-bold py-2 rounded uppercase tracking-wider transition"
                            >
                              Add to Lib
                            </button>
                            <button 
                              onClick={() => triggerScrape([item])}
                              className="flex-1 bg-blue-600 hover:bg-blue-500 text-xs font-bold py-2 rounded uppercase tracking-wider transition"
                            >
                              Scrape
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'library' && (
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">My {service} Library</h3>
                <div className="flex gap-4">
                  <select 
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="Sonarr">TV</option>
                    <option value="Radarr">Movies</option>
                  </select>
                </div>
              </div>

              {library.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                  {library.map((item: any) => {
                    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || 
                                   item.images?.find((img: any) => img.coverType === 'poster')?.url;
                    const posterUrl = poster ? `${API_BASE}/media/poster?url=${encodeURIComponent(poster)}` : null;

                    return (
                      <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-500 transition group">
                        <div className="aspect-[2/3] bg-slate-700 relative flex items-center justify-center">
                          {posterUrl ? (
                            <img src={posterUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <Film className="text-slate-600" size={48} />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60"></div>
                          <div className="absolute bottom-4 left-4 right-4">
                            <h3 className="font-bold text-lg leading-tight truncate">{item.title}</h3>
                            <p className="text-slate-400 text-sm">{item.year}</p>
                          </div>
                        </div>
                        <div className="p-4 space-y-4">
                          {service === 'Sonarr' && (
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <label className="text-slate-500 block mb-1">Season</label>
                                <input type="number" value={season} onChange={e => setSeason(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                              </div>
                              <div>
                                <label className="text-slate-500 block mb-1">Start</label>
                                <input type="number" value={epStart} onChange={e => setEpStart(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                              </div>
                              <div>
                                <label className="text-slate-500 block mb-1">End</label>
                                <input type="number" value={epEnd} onChange={e => setEpEnd(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1" />
                              </div>
                            </div>
                          )}
                          <button 
                            onClick={() => triggerScrape([item])}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-xs font-bold py-2 rounded uppercase tracking-wider transition"
                          >
                            Scrape
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-slate-500">
                  <Film size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Loading your library...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="max-w-6xl mx-auto">
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                  <h3 className="font-bold text-lg">Pending Downloads</h3>
                  <button onClick={clearQueue} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-2">
                    <Trash2 size={16} /> Clear Queue
                  </button>
                </div>
                {queue.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <Download size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Your download queue is empty.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-widest">
                          <th className="px-6 py-4">Media</th>
                          <th className="px-6 py-4">Source</th>
                          <th className="px-6 py-4">Type</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {queue.map((item: any, i) => (
                          <tr key={i} className="hover:bg-slate-700/30 transition">
                            <td className="px-6 py-4">
                              <div className="font-medium">{item.title}</div>
                              <div className="text-xs text-slate-500">{item.isMovie ? item.year : `Season ${item.season}`}</div>
                            </td>
                            <td className="px-6 py-4 truncate max-w-xs text-xs text-blue-400">
                              {item.originalUrl}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${item.isMovie ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                                {item.isMovie ? 'Movie' : 'Show'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button className="p-2 text-slate-500 hover:text-red-400 transition"><Trash2 size={16}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'downloads' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-700">
                  <h3 className="font-bold text-lg">Active & Recent Tasks</h3>
                </div>
                {Object.keys(activeDownloads).length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No active downloads at the moment.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700">
                    {Object.entries(activeDownloads).map(([name, data]) => (
                      <div key={name} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          {data.status === 'downloading' ? (
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 animate-spin">
                              <Play size={20} />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                              <AlertCircle size={20} />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-sm sm:text-base">{name}</div>
                            <div className="text-xs text-slate-500 capitalize">{data.status}</div>
                          </div>
                        </div>
                        {data.status === 'failed' && (
                          <button 
                            onClick={() => setActiveDownloads(prev => {
                              const next = { ...prev };
                              delete next[name];
                              return next;
                            })}
                            className="text-xs text-slate-500 hover:text-white self-end sm:self-auto"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'console' && (
            <div className="h-full flex flex-col max-w-6xl mx-auto">
              <div className="bg-black rounded-xl overflow-hidden flex-1 flex flex-col border border-slate-700 shadow-2xl min-h-[300px]">
                <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex items-center justify-between shrink-0">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <div className="text-xs font-mono text-slate-500">omni-bridge@v2.6 ~ live_logs</div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 font-mono text-sm space-y-1">
                  {logs.length === 0 && <p className="text-slate-700 italic">Waiting for process output...</p>}
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      ${log.includes('SUCCESS') ? 'text-green-400' : ''}
                      ${log.includes('FAILED') ? 'text-red-400' : ''}
                      ${log.includes('Sniffing') ? 'text-blue-400' : ''}
                      ${!log.includes('SUCCESS') && !log.includes('FAILED') && !log.includes('Sniffing') ? 'text-slate-300' : ''}
                    `}>
                      {log}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
