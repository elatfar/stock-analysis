import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Settings as SettingsIcon,
  ListTodo,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  X,
  Info,
  Database,
  CheckCircle2,
  Search
} from "lucide-react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

// Static catalog of available assets to manage
const AVAILABLE_ASSETS = [
  { ticker: "XOM", name: "ExxonMobil", category: "Energy" },
  { ticker: "CVX", name: "Chevron", category: "Energy" },
  { ticker: "GOLD", name: "Barrick Gold", category: "Metal" },
  { ticker: "BTC", name: "Bitcoin", category: "Metal" },
  { ticker: "TSLA", name: "Tesla", category: "Tech/Lithium" },
  { ticker: "ALB", name: "Albemarle", category: "Tech/Lithium" }
];

const MOCK_PRICES: Record<string, string> = {
  XOM: "$117.85",
  CVX: "$158.40",
  GOLD: "$22.90",
  BTC: "$68,240.50",
  TSLA: "$174.60",
  ALB: "$112.15"
};

// const _getPriceForTicker = (ticker: string) => {
//   if (MOCK_PRICES[ticker]) return MOCK_PRICES[ticker];
//   let hash = 0;
//   for (let i = 0; i < ticker.length; i++) {
//     hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
//   }
//   const price = Math.abs(hash % 250) + 15.5;
//   return `$${price.toFixed(2)}`;
// };

interface WatchlistItem {
  ticker: string;
  name: string;
  category: string;
  is_active: boolean;
}

interface SentimentLog {
  id: string;
  ticker: string;
  news_title: string;
  news_url: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  score: number;
  reason: string;
  created_at: string;
}

interface DrilldownDetail {
  ticker: string;
  drivers: string[];
  articles: Array<{
    id: string;
    sentiment: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
  }>;
  confidenceScore: number;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<"dashboard" | "manage" | "settings">("dashboard");
  const [activeWatchlist, setActiveWatchlist] = useState<WatchlistItem[]>([]);
  const [sentimentLogs, setSentimentLogs] = useState<SentimentLog[]>([]);
  const [apiKeys, setApiKeys] = useState<{
    openaiKey: string;
    hfToken: string;
    newsSources: string[];
    customRss: string;
  }>({ openaiKey: "", hfToken: "", newsSources: ["yahoo"], customRss: "" });

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ ticker: string; name: string; category: string }>>([]);
  const [searching, setSearching] = useState(false);

  // Drill-down states (On-Demand Fetching)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [tickerDetails, setTickerDetails] = useState<DrilldownDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Job status
  const [analyzingTicker, setAnalyzingTicker] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);

  // 1. Load settings and data on mount
  useEffect(() => {
    const savedKeys = localStorage.getItem("sentiment_api_keys");
    if (savedKeys) {
      const parsed = JSON.parse(savedKeys);
      // Migrate from old string format if necessary
      if (typeof parsed.newsSource === "string") {
        parsed.newsSources = [parsed.newsSource];
        delete parsed.newsSource;
      }
      if (!parsed.newsSources) parsed.newsSources = ["yahoo"];
      if (!parsed.customRss) parsed.customRss = "";
      setApiKeys(parsed);
    }
    fetchWatchlist();
    fetchSentimentLogs();
  }, []);

  // Show auto-dismiss toast
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 2. Fetch watchlist from Supabase
  const fetchWatchlist = async () => {
    try {
      setLoadingWatchlist(true);
      const res = await fetch(`${SERVER_URL}/api/watchlist`);
      const payload = await res.json();
      if (payload.success) {
        // Filter out inactive ones
        const activeItems = payload.data.filter((item: any) => item.is_active);
        setActiveWatchlist(activeItems);
      }
    } catch (err) {
      console.error("Failed to load watchlist:", err);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  // 3. Fetch sentiment logs
  const fetchSentimentLogs = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/sentiment/history`);
      const payload = await res.json();
      if (payload.success) {
        setSentimentLogs(payload.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  // 4. On-Demand Fetch details when ticker selected
  useEffect(() => {
    if (!selectedTicker) {
      setTickerDetails(null);
      return;
    }

    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        const res = await fetch(`${SERVER_URL}/api/sentiment/details?ticker=${selectedTicker}`);
        const payload = await res.json();
        if (payload.success) {
          setTickerDetails(payload.data);
        } else {
          showToast(payload.error || "Failed to load ticker details", "error");
        }
      } catch (err) {
        console.error("Error loading drill-down info:", err);
        showToast("Server communication error", "error");
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [selectedTicker]);

  // 5. Toggle asset active status
  const handleToggleAsset = async (ticker: string, name: string, category: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/watchlist/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name, category, is_active: !currentActive })
      });
      const payload = await res.json();
      if (payload.success) {
        showToast(`${ticker} ${!currentActive ? "added to" : "removed from"} watchlist.`);
        fetchWatchlist();
      } else {
        showToast(payload.error || "Failed to toggle asset", "error");
      }
    } catch (err) {
      showToast("Server connection failed", "error");
    }
  };

  // 6. Run AI Analysis
  const handleAnalyzeSentiment = async (e: React.MouseEvent, ticker: string) => {
    e.stopPropagation(); // Prevent opening drawer
    setAnalyzingTicker(ticker);
    try {
      const res = await fetch(`${SERVER_URL}/api/sentiment/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-key": apiKeys.openaiKey,
          "x-hf-token": apiKeys.hfToken
        },
        body: JSON.stringify({
          ticker,
          newsSources: apiKeys.newsSources,
          customRss: apiKeys.customRss
        })
      });
      const payload = await res.json();
      if (payload.success) {
        showToast(payload.message || `Analysis for ${ticker} completed.`);
        fetchSentimentLogs();
        // If drawer is open for this ticker, refresh details
        if (selectedTicker === ticker) {
          setSelectedTicker(null);
          setTimeout(() => setSelectedTicker(ticker), 50);
        }
      } else {
        showToast(payload.error || "Analysis failed.", "error");
      }
    } catch (err) {
      showToast("Server connection error during analysis", "error");
    } finally {
      setAnalyzingTicker(null);
    }
  };

  // 7. Save Settings
  const handleSaveSettings = (openaiKey: string, hfToken: string, newsSources: string[], customRss: string) => {
    const keys = { openaiKey, hfToken, newsSources, customRss };
    localStorage.setItem("sentiment_api_keys", JSON.stringify(keys));
    setApiKeys(keys);
    showToast("Settings saved locally.");
  };

  // 8. Search Assets
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/assets/search?q=${encodeURIComponent(searchQuery)}`);
      const payload = await res.json();
      if (payload.success) {
        setSearchResults(payload.data);
      } else {
        showToast(payload.error || "Failed to search assets", "error");
      }
    } catch (err) {
      showToast("Server connection error during search", "error");
    } finally {
      setSearching(false);
    }
  };

  // Calculations for dashboard
  const getTickerSentimentStats = (ticker: string) => {
    const tickerLogs = sentimentLogs.filter(log => log.ticker === ticker);
    if (tickerLogs.length === 0) {
      return { dominant: "Neutral" as const, scores: [0.5, 0.5, 0.5, 0.5, 0.5], recommendation: "WAIT" };
    }

    // Compute dominant sentiment
    const counts = { Positive: 0, Neutral: 0, Negative: 0 };
    tickerLogs.forEach(log => {
      counts[log.sentiment] = (counts[log.sentiment] || 0) + 1;
    });

    let dominant: "Positive" | "Neutral" | "Negative" = "Neutral";
    if (counts.Positive > counts.Neutral && counts.Positive > counts.Negative) {
      dominant = "Positive";
    } else if (counts.Negative > counts.Neutral && counts.Negative > counts.Positive) {
      dominant = "Negative";
    }

    // Compute confidence based on top 5
    const topLogs = tickerLogs.slice(0, 5);
    const totalScore = topLogs.reduce((sum, log) => sum + Number(log.score || 0), 0);
    const confidence = Math.round((totalScore / topLogs.length) * 100);

    let recommendation = "HOLD";
    if (dominant === "Positive") {
      recommendation = confidence >= 70 ? "STRONG BUY" : "BUY";
    } else if (dominant === "Negative") {
      recommendation = confidence >= 70 ? "STRONG SELL" : "SELL";
    }

    // Sparklines data (chronological list of scores, max 5)
    // Note: sentimentLogs are sorted desc, so we reverse it to represent time progression left-to-right
    const scores = tickerLogs
      .slice(0, 5)
      .map(log => Number(log.score))
      .reverse();

    return { dominant, scores, recommendation, confidence };
  };

  // Render SVG Sparkline
  const renderSparkline = (scores: number[], sentiment: "Positive" | "Neutral" | "Negative") => {
    if (scores.length < 2) return <span className="text-slate-600 text-xs">No Trend</span>;
    const width = 60;
    const height = 18;
    const points = scores.map((score, index) => {
      const x = (index / (scores.length - 1)) * width;
      const y = height - (score * height);
      return `${x},${y}`;
    });
    const pathD = `M ${points.join(" L ")}`;

    let color = "stroke-slate-500";
    if (sentiment === "Positive") color = "stroke-emerald-500";
    if (sentiment === "Negative") color = "stroke-rose-500";

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={`w-16 h-5 fill-none stroke-2 ${color}`}>
        <path d={pathD} />
      </svg>
    );
  };

  const hasKeys = apiKeys.openaiKey.trim() !== "" || apiKeys.hfToken.trim() !== "";

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">

      {/* SIDEBAR */}
      <aside className="w-56 bg-slate-950 border-r border-slate-800 flex flex-col justify-between flex-shrink-0">
        <div>
          {/* Logo Title */}
          <div className="h-14 border-b border-slate-800 flex items-center px-4 gap-2">
            <Database className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold tracking-wide text-sm text-slate-200">Curated Sentiment</span>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-1">
            <button
              onClick={() => setCurrentTab("dashboard")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md text-left ${currentTab === "dashboard"
                  ? "bg-slate-900 text-white border-l-2 border-emerald-500"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              My Watchlist
            </button>
            <button
              onClick={() => setCurrentTab("manage")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md text-left ${currentTab === "manage"
                  ? "bg-slate-900 text-white border-l-2 border-emerald-500"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
            >
              <ListTodo className="w-4 h-4" />
              Manage Assets
            </button>
            <button
              onClick={() => setCurrentTab("settings")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md text-left ${currentTab === "settings"
                  ? "bg-slate-900 text-white border-l-2 border-emerald-500"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </button>
          </nav>
        </div>

        {/* Local Key Status indicator */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/20 text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5 justify-between">
            <span>Sentiment engine:</span>
            {hasKeys ? (
              <span className="text-emerald-500 font-semibold">Active AI</span>
            ) : (
              <span className="text-amber-500 font-semibold">Local Fallback</span>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* HEADER */}
        <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-sm font-semibold tracking-wide text-slate-200 capitalize">
            {currentTab === "dashboard" ? "Watchlist Dashboard" : currentTab === "manage" ? "Manage Watchlist Assets" : "System Settings"}
          </h1>

          {/* Toast message display */}
          {toastMessage && (
            <div className={`text-xs px-3 py-1 border rounded ${toastMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}>
              {toastMessage.text}
            </div>
          )}
        </header>

        {/* WORKSPACE CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">

          {/* Tab Pages */}
          <div className="flex-1 overflow-y-auto p-6">

            {/* API WARNING KEY STATUS */}
            {!hasKeys && currentTab !== "settings" && (
              <div className="mb-6 bg-amber-500/5 border border-amber-500/10 text-amber-500/90 p-3 rounded flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <span className="font-semibold block mb-0.5">OpenAI or Hugging Face Keys Missing</span>
                  The AI Sentiment Engine is currently running in local keyword fallback mode. To utilize GPT-4o-mini or Hugging Face classifiers, add your keys on the <button onClick={() => setCurrentTab("settings")} className="underline font-semibold hover:text-white">Settings</button> page.
                </div>
              </div>
            )}

            {/* TAB: DASHBOARD */}
            {currentTab === "dashboard" && (
              <div className="space-y-4">
                {loadingWatchlist ? (
                  <div className="text-xs text-slate-500">Loading watchlist...</div>
                ) : activeWatchlist.length === 0 ? (
                  <div className="border border-dashed border-slate-800 rounded-md p-10 text-center max-w-lg mx-auto mt-8">
                    <Info className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                    <h3 className="text-sm font-semibold text-slate-300">Your Watchlist is Empty</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Choose which commodities, metals, or technology stocks to monitor by selecting them from the assets list.
                    </p>
                    <button
                      onClick={() => setCurrentTab("manage")}
                      className="mt-4 bg-emerald-600 text-white text-xs px-3 py-1.5 rounded font-semibold hover:bg-emerald-500"
                    >
                      Configure Assets
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded bg-slate-950 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/30 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          <th className="py-2.5 px-4">Ticker</th>
                          <th className="py-2.5 px-4">Asset Name</th>
                          <th className="py-2.5 px-4">Category</th>
                          <th className="py-2.5 px-4">Last Price</th>
                          <th className="py-2.5 px-4">Dominant Sentiment</th>
                          <th className="py-2.5 px-4">Action Bias</th>
                          <th className="py-2.5 px-4">Trend (Sparkline)</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeWatchlist.map((item) => {
                          const { dominant, scores, recommendation } = getTickerSentimentStats(item.ticker);
                          const isSelected = selectedTicker === item.ticker;

                          return (
                            <tr
                              key={item.ticker}
                              onClick={() => setSelectedTicker(isSelected ? null : item.ticker)}
                              className={`border-b border-slate-900 text-xs cursor-pointer hover:bg-slate-900/40 ${isSelected ? "bg-slate-900/60" : ""
                                }`}
                            >
                              <td className="py-3 px-4 font-bold text-slate-300">{item.ticker}</td>
                              <td className="py-3 px-4 text-slate-400">{item.name}</td>
                              <td className="py-3 px-4 text-slate-500">{item.category}</td>
                              <td className="py-3 px-4 text-slate-300 font-mono">{MOCK_PRICES[item.ticker] || "N/A"}</td>
                              <td className="py-3 px-4">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${dominant === "Positive"
                                    ? "accent-positive"
                                    : dominant === "Negative"
                                      ? "accent-negative"
                                      : "accent-neutral"
                                  }`}>
                                  {dominant}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`font-bold text-[10px] uppercase ${recommendation.includes("BUY") ? "text-emerald-500" :
                                    recommendation.includes("SELL") ? "text-rose-500" :
                                      "text-slate-400"
                                  }`}>
                                  {recommendation}
                                </span>
                              </td>
                              <td className="py-3 px-4">{renderSparkline(scores, dominant)}</td>
                              <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => handleAnalyzeSentiment(e, item.ticker)}
                                  disabled={analyzingTicker === item.ticker}
                                  className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-50 inline-flex items-center gap-1 text-[10px]"
                                  title="Scrape and analyze news sentiment"
                                >
                                  {analyzingTicker === item.ticker ? (
                                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  Analyze
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: MANAGE WATCHLIST */}
            {currentTab === "manage" && (
              <div className="max-w-2xl bg-slate-950 border border-slate-800 rounded-md p-6 space-y-6">
                <div>
                  <h2 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Asset Directory</h2>
                  <p className="text-[11px] text-slate-500">Enable tickers to track sentiment. Selecting triggers background database synchronization.</p>
                </div>

                {/* Search Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-md p-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-300">Search New Assets</h3>
                    <p className="text-[10px] text-slate-500">Find stocks, ETFs, or crypto via Yahoo Finance.</p>
                  </div>

                  <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search ticker or name (e.g., AAPL, Bitcoin)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-slate-700 placeholder-slate-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searching || !searchQuery.trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
                    >
                      {searching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Search
                    </button>
                  </form>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-slate-800">
                      <h4 className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">Search Results</h4>
                      <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {searchResults.map(asset => {
                          const isChecked = activeWatchlist.some(w => w.ticker === asset.ticker);
                          return (
                            <label key={asset.ticker} className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 hover:bg-slate-900 cursor-pointer select-none">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleAsset(asset.ticker, asset.name, asset.category, isChecked)}
                                  className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0"
                                />
                                <div>
                                  <div className="text-xs font-bold text-slate-300">{asset.ticker}</div>
                                  <div className="text-[10px] text-slate-500">{asset.name} • {asset.category}</div>
                                </div>
                              </div>
                              {isChecked && <span className="text-[9px] uppercase tracking-wider text-emerald-500 font-semibold px-2 py-0.5 bg-emerald-500/10 rounded">Added</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  {/* Category energy */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-900">Energy</h3>
                    <div className="space-y-2">
                      {AVAILABLE_ASSETS.filter(a => a.category === "Energy").map(asset => {
                        const isChecked = activeWatchlist.some(w => w.ticker === asset.ticker);
                        return (
                          <label key={asset.ticker} className="flex items-center gap-2.5 text-xs text-slate-400 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleAsset(asset.ticker, asset.name, asset.category, isChecked)}
                              className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0"
                            />
                            <span>{asset.ticker} <span className="text-[10px] text-slate-600">({asset.name})</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category metals */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-900">Metals / Crypto</h3>
                    <div className="space-y-2">
                      {AVAILABLE_ASSETS.filter(a => a.category === "Metal").map(asset => {
                        const isChecked = activeWatchlist.some(w => w.ticker === asset.ticker);
                        return (
                          <label key={asset.ticker} className="flex items-center gap-2.5 text-xs text-slate-400 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleAsset(asset.ticker, asset.name, asset.category, isChecked)}
                              className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0"
                            />
                            <span>{asset.ticker} <span className="text-[10px] text-slate-600">({asset.name})</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category tech */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-900">Tech / Lithium</h3>
                    <div className="space-y-2">
                      {AVAILABLE_ASSETS.filter(a => a.category === "Tech/Lithium").map(asset => {
                        const isChecked = activeWatchlist.some(w => w.ticker === asset.ticker);
                        return (
                          <label key={asset.ticker} className="flex items-center gap-2.5 text-xs text-slate-400 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleAsset(asset.ticker, asset.name, asset.category, isChecked)}
                              className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0"
                            />
                            <span>{asset.ticker} <span className="text-[10px] text-slate-600">({asset.name})</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SETTINGS */}
            {currentTab === "settings" && (
              <div className="max-w-md bg-slate-950 border border-slate-800 rounded p-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    const selectedSources = formData.getAll("newsSources") as string[];
                    handleSaveSettings(
                      form.openai.value,
                      form.hf.value,
                      selectedSources,
                      form.customRss.value
                    );
                  }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">API Key Configuration</h2>
                    <p className="text-[11px] text-slate-500">Provide keys to trigger sentiment analysis models. Saved locally in your browser.</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">OpenAI API Key</label>
                      <input
                        type="password"
                        name="openai"
                        defaultValue={apiKeys.openaiKey}
                        placeholder="sk-..."
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">Hugging Face Access Token</label>
                      <input
                        type="password"
                        name="hf"
                        defaultValue={apiKeys.hfToken}
                        placeholder="hf_..."
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-700"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <div className="mb-3">
                      <h2 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Scraping Sources</h2>
                      <p className="text-[11px] text-slate-500">Select multiple default data sources or specify a custom RSS feed.</p>
                    </div>

                    <div className="space-y-2 mb-4">
                      <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          name="newsSources"
                          value="yahoo"
                          defaultChecked={apiKeys.newsSources.includes("yahoo")}
                          className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0"
                        />
                        <span>Yahoo Finance</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          name="newsSources"
                          value="google"
                          defaultChecked={apiKeys.newsSources.includes("google")}
                          className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0"
                        />
                        <span>Google News</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">Custom RSS Feed URL (Optional)</label>
                      <input
                        type="url"
                        name="customRss"
                        defaultValue={apiKeys.customRss}
                        placeholder="e.g. https://cointelegraph.com/rss/tag/[TICKER]"
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-700"
                      />
                      <p className="text-[9px] text-slate-500 mt-1">Gunakan tag <strong>[TICKER]</strong> untuk menggantikan kode aset secara otomatis pada URL.</p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 text-white font-semibold text-xs py-2 rounded hover:bg-emerald-500"
                  >
                    Save Configuration
                  </button>
                </form>
              </div>
            )}

          </div>

          {/* DRILL-DOWN PANEL (LAZY DRAWER) */}
          {selectedTicker && (
            <div className="w-[420px] bg-slate-950 border-l border-slate-800 flex flex-col flex-shrink-0">

              {/* Drawer Header */}
              <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-200">{selectedTicker} Analysis</span>
                  <span className="text-[10px] text-slate-500">Drill-down</span>
                </div>
                <button
                  onClick={() => setSelectedTicker(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {loadingDetails ? (
                  <div className="text-xs text-slate-500 flex items-center gap-2 py-4">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    Fetching sentiment details...
                  </div>
                ) : tickerDetails ? (
                  <>
                    {/* Score Panel */}
                    <div className="bg-slate-900 border border-slate-800 rounded p-3 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] uppercase text-slate-500 font-semibold">AI Confidence</div>
                        <div className="text-xl font-mono font-bold text-slate-100 mt-0.5">{tickerDetails.confidenceScore}%</div>
                      </div>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500/20" />
                    </div>

                    {/* Sentiment Drivers */}
                    <div className="space-y-2">
                      <h3 className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Sentiment Drivers</h3>
                      <ul className="space-y-1.5">
                        {tickerDetails.drivers.map((driver, index) => (
                          <li key={index} className="text-xs text-slate-300 bg-slate-900/40 border border-slate-900/60 p-2 rounded flex gap-2">
                            <span className="text-emerald-500 font-bold">•</span>
                            <span>{driver}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Top References */}
                    <div className="space-y-2">
                      <h3 className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Top Reference Articles</h3>
                      <div className="space-y-2">
                        {tickerDetails.articles.length === 0 ? (
                          <div className="text-[11px] text-slate-600 italic">No referenced articles found.</div>
                        ) : (
                          tickerDetails.articles.map((art) => (
                            <div key={art.id} className="bg-slate-900/30 border border-slate-900 rounded p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className={`px-1 rounded uppercase font-semibold ${art.sentiment === "Positive"
                                    ? "accent-positive"
                                    : art.sentiment === "Negative"
                                      ? "accent-negative"
                                      : "accent-neutral"
                                  }`}>
                                  {art.sentiment}
                                </span>
                                <span className="text-slate-600">{art.source}</span>
                              </div>
                              <a
                                href={art.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-slate-300 hover:text-white hover:underline flex items-start gap-1 justify-between"
                              >
                                <span>{art.title}</span>
                                <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-500" />
                              </a>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-500 italic">No details available. Click analyze on this asset first.</div>
                )}
              </div>

            </div>
          )}

        </div>
      </main>

    </div>
  );
}
