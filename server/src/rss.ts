export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// Helper to fetch a single URL
async function fetchRssUrl(url: string, sourceName: string): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch RSS for ${sourceName}: ${res.statusText}`);
    }

    const xmlText = await res.text();
    const items: RssItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null && items.length < 5) {
      const itemContent = match[1];
      if (!itemContent) continue;

      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

      if (titleMatch && titleMatch[1]) {
        let title = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
        // Clean basic XML character entities
        title = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");

        let link = (linkMatch && linkMatch[1]) ? linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
        let pubDate = (pubDateMatch && pubDateMatch[1]) ? pubDateMatch[1].trim() : new Date().toUTCString();

        items.push({
          title,
          link,
          pubDate,
          source: sourceName
        });
      }
    }
    return items;
  } catch (error) {
    console.error(`RSS fetch error for ${sourceName}:`, error);
    return [];
  }
}

/**
 * Fetches and parses RSS feed for the given ticker from multiple sources.
 * Limits output to 5 items to minimize rate limits and quota.
 */
export async function fetchRssFeed(ticker: string, newsSources: string[] = ["yahoo"], customRss: string = ""): Promise<RssItem[]> {
  const promises: Promise<RssItem[]>[] = [];
  let symbol = ticker.toUpperCase();

  for (const source of newsSources) {
    if (source === "yahoo") {
      let yahooSymbol = symbol === 'BTC' ? 'BTC-USD' : symbol;
      promises.push(fetchRssUrl(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSymbol}`, 'Yahoo Finance'));
    } else if (source === "google") {
      promises.push(fetchRssUrl(`https://news.google.com/rss/search?q=${symbol}+stock&hl=en-US&gl=US&ceid=US:en`, 'Google News'));
    }
  }

  if (customRss && customRss.trim() !== "") {
    const finalUrl = customRss.replace(/\[TICKER\]/g, symbol);
    promises.push(fetchRssUrl(finalUrl, 'Custom Feed'));
  }

  const results = await Promise.all(promises);
  let allItems = results.flat();

  if (allItems.length === 0) {
    console.warn(`No items parsed for ${ticker}, serving mock fallback.`);
    return getMockNews(ticker);
  }

  // Deduplicate and sort by date desc
  const uniqueTitles = new Set();
  const dedupedItems = [];
  for (const item of allItems) {
    if (!uniqueTitles.has(item.title)) {
      uniqueTitles.add(item.title);
      dedupedItems.push(item);
    }
  }

  dedupedItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // Return top 5 across all sources to limit AI cost
  return dedupedItems.slice(0, 5);
}

/**
 * Returns mock news if Yahoo Finance is unreachable (e.g. rate limit, offline).
 */
export function getMockNews(ticker: string): RssItem[] {
  const now = new Date();
  const mockTemplates = [
    {
      title: `${ticker} shows consolidation pattern as major indicators reset.`,
      source: 'Yahoo Finance (Mock)'
    },
    {
      title: `Market experts analyze key resistance levels for ${ticker} this week.`,
      source: 'Yahoo Finance (Mock)'
    },
    {
      title: `Retail interest in ${ticker} surges following community discussion.`,
      source: 'Reddit Feed (Mock)'
    },
    {
      title: `Macroeconomic trends suggest consolidation phase for assets like ${ticker}.`,
      source: 'Yahoo Finance (Mock)'
    },
    {
      title: `Technical breakout: Is ${ticker} preparing for its next major move?`,
      source: 'Yahoo Finance (Mock)'
    }
  ];

  return mockTemplates.map((t, i) => {
    const pubDate = new Date(now.getTime() - i * 4 * 3600000).toUTCString();
    return {
      title: t.title,
      link: `https://finance.yahoo.com/quote/${ticker}`,
      pubDate,
      source: t.source
    };
  });
}
