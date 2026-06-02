import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";
import { fetchRssFeed } from "./rss";
import { analyzeSentiment } from "./ai";

const supabaseUrl = process.env.SUPABASE_URL || "https://lqyvelxkllydugnwxoou.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_v7PcAVgzwUF0jQ2ZJLe-wg_SfoZk72m";
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER = "00000000-0000-0000-0000-000000000000";

export const app = new Hono()
  .basePath("/api")
  .use(cors())
  .get("/", (c) => {
    return c.text("Curated Sentiment Tracker API is online!");
  })

  // 1. Get active watchlist
  .get("/watchlist", async (c) => {
    try {
      const { data, error } = await supabase
        .from("active_watchlist")
        .select("*")
        .eq("user_id", DEFAULT_USER);

      if (error) throw error;
      return c.json({ success: true, data: data || [] });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })

  // 2. Toggle watchlist item (inserts or updates state)
  .post("/watchlist/toggle", async (c) => {
    try {
      const { ticker, name, category, is_active } = await c.req.json();

      if (!ticker || !name || !category) {
        return c.json({ success: false, error: "Missing required fields" }, 400);
      }

      const { data, error } = await supabase
        .from("active_watchlist")
        .upsert(
          {
            user_id: DEFAULT_USER,
            ticker: ticker.toUpperCase(),
            name,
            category,
            is_active
          },
          { onConflict: "user_id,ticker" }
        )
        .select();

      if (error) throw error;
      return c.json({ success: true, data: data?.[0] });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })

  // 3. Get all sentiment history logs
  .get("/sentiment/history", async (c) => {
    try {
      const { data, error } = await supabase
        .from("sentiment_logs")
        .select("*")
        .eq("user_id", DEFAULT_USER)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return c.json({ success: true, data: data || [] });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })

  // 4. On-Demand details fetching for drill-down view
  .get("/sentiment/details", async (c) => {
    try {
      const ticker = c.req.query("ticker");
      if (!ticker) {
        return c.json({ success: false, error: "Ticker query parameter is required" }, 400);
      }

      const { data: logs, error } = await supabase
        .from("sentiment_logs")
        .select("*")
        .eq("user_id", DEFAULT_USER)
        .eq("ticker", ticker.toUpperCase())
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!logs || logs.length === 0) {
        return c.json({
          success: true,
          data: {
            ticker: ticker.toUpperCase(),
            drivers: ["No analysis data available yet. Click 'Analyze' to run key sentiment metrics."],
            articles: [],
            confidenceScore: 0
          }
        });
      }

      // 1. Extract drivers from reasons (unique non-empty reasons)
      const drivers = Array.from(new Set(logs.map(log => log.reason).filter(Boolean)));

      // 2. Format references
      const articles = logs.map(log => ({
        id: log.id,
        sentiment: log.sentiment,
        title: log.news_title,
        url: log.news_url || "#",
        source: log.news_url?.includes("reddit.com") ? "Reddit" : "Yahoo Finance",
        publishedAt: log.published_at || log.created_at
      }));

      // 3. Compute AI Confidence Score: average score * 100
      const totalScore = logs.reduce((sum, log) => sum + Number(log.score || 0), 0);
      const confidenceScore = Math.round((totalScore / logs.length) * 100);

      return c.json({
        success: true,
        data: {
          ticker: ticker.toUpperCase(),
          drivers: drivers.length > 0 ? drivers.slice(0, 3) : ["No specific drivers reported."],
          articles,
          confidenceScore
        }
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })

  // 5. Trigger news scraping and AI sentiment evaluation
  .post("/sentiment/analyze", async (c) => {
    try {
      const { ticker, newsSources, customRss } = await c.req.json();
      if (!ticker) {
        return c.json({ success: false, error: "Ticker is required" }, 400);
      }

      const openaiKey = c.req.header("x-openai-key") || "";
      const hfToken = c.req.header("x-hf-token") || "";

      // Fetch top 5 recent articles
      const newsItems = await fetchRssFeed(ticker, newsSources || ["yahoo"], customRss || "");
      const results = [];

      for (const item of newsItems) {
        // Deduplicate headlines to avoid redundant LLM billing/api counts
        const { data: existing, error: checkError } = await supabase
          .from("sentiment_logs")
          .select("id")
          .eq("user_id", DEFAULT_USER)
          .eq("ticker", ticker.toUpperCase())
          .eq("news_title", item.title)
          .limit(1);

        if (checkError) {
          console.error("Error checking existing logs:", checkError);
        }

        if (existing && existing.length > 0) {
          continue; // Already processed
        }

        // Run AI Sentiment evaluation
        const analysis = await analyzeSentiment(item.title, {
          openaiKey,
          hfToken
        });

        // Store log into Supabase
        const { error: insertError } = await supabase
          .from("sentiment_logs")
          .insert({
            user_id: DEFAULT_USER,
            ticker: ticker.toUpperCase(),
            news_title: item.title,
            news_url: item.link,
            sentiment: analysis.sentiment,
            score: analysis.score,
            reason: analysis.reason,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
          });

        if (insertError) {
          console.error("Error saving sentiment log:", insertError);
        } else {
          results.push({
            title: item.title,
            ...analysis
          });
        }
      }

      return c.json({
        success: true,
        message: `Analysis completed for ${ticker.toUpperCase()}. Processed ${results.length} new articles.`,
        addedCount: results.length
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  })

  // 6. Search assets via Yahoo Finance Autocomplete API
  .get("/assets/search", async (c) => {
    try {
      const query = c.req.query("q");
      if (!query || query.trim() === "") {
        return c.json({ success: true, data: [] });
      }

      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });

      if (!res.ok) {
        throw new Error(`Yahoo Search API error: ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const quotes = data.quotes || [];

      // Filter and map quotes
      const results = quotes
        .filter((q: any) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "CRYPTOCURRENCY" || q.quoteType === "ETF"))
        .slice(0, 5)
        .map((q: any) => {
          let category = "Equities";
          if (q.quoteType === "CRYPTOCURRENCY") {
            category = "Metal / Crypto";
          } else if (q.sector) {
            category = q.sector;
          }
          return {
            ticker: q.symbol,
            name: q.shortname || q.longname || q.symbol,
            category
          };
        });

      return c.json({ success: true, data: results });
    } catch (err: any) {
      console.error("Search assets error:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

export default app;