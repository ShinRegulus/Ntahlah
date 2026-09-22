/**
 * Nuvio Provider Extension: AniChan
 * Target Site: https://anichan.to
 */

class AniChanProvider {
  constructor() {
    this.id = 'anichan';
    this.name = 'AniChan';
    this.baseUrl = 'https://anichan.to';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://anichan.to/'
    };
  }

  /**
   * Search Anime
   */
  async search(query) {
    try {
      const searchUrl = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, { headers: this.headers });
      if (!response.ok) return [];

      const html = await response.text();
      const results = [];

      // Flexible RegEx matching for AniChan items
      const itemRegex = /<a[^>]+href=["'](\/[^"']+)["'][^>]*class=["'][^"']*film-poster-ahref[^"']*["'][^>]*title=["']([^"']+)["'][\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)["']/g;
      
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const path = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
        results.push({
          id: path,
          title: match[2].trim(),
          poster: match[3],
          type: 'tv',
          provider: this.id
        });
      }

      return results;
    } catch (error) {
      console.error('[AniChan Error - search]:', error);
      return [];
    }
  }

  /**
   * Get Detail & Episode List
   */
  async getDetail(id) {
    try {
      const detailUrl = id.startsWith('http') ? id : `${this.baseUrl}${id.startsWith('/') ? '' : '/'}${id}`;
      const response = await fetch(detailUrl, { headers: this.headers });
      if (!response.ok) return null;

      const html = await response.text();

      // Extract details
      const titleMatch = html.match(/<h[12][^>]*class=["'][^"']*film-name[^"']*["'][^>]*>([\s\S]*?)<\/h[12]>/i);
      const synopsisMatch = html.match(/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      const posterMatch = html.match(/<img[^>]*class=["'][^"']*film-poster-img[^"']*["'][^>]*src=["']([^"']+)["']/i);

      // Extract episodes
      const episodes = [];
      const epRegex = /<a[^>]+href=["'](\/[^"']+)["'][^>]*data-number=["']([^"']+)["'][^>]*>/g;

      let match;
      while ((match = epRegex.exec(html)) !== null) {
        episodes.push({
          id: match[1],
          number: parseFloat(match[2]) || episodes.length + 1,
          title: `Episode ${match[2]}`
        });
      }

      return {
        id: id,
        title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Anime',
        synopsis: synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        poster: posterMatch ? posterMatch[1] : '',
        episodes: episodes.reverse() // Sort episode 1, 2, 3...
      };
    } catch (error) {
      console.error('[AniChan Error - getDetail]:', error);
      return null;
    }
  }

  /**
   * Get Streams (Video Sources)
   */
  async getStreams(episodeId) {
    try {
      const epUrl = episodeId.startsWith('http') ? episodeId : `${this.baseUrl}${episodeId.startsWith('/') ? '' : '/'}${episodeId}`;
      const response = await fetch(epUrl, { headers: this.headers });
      if (!response.ok) return [];

      const html = await response.text();
      const streams = [];

      // Extract Iframe Embed / Stream Player
      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);

      if (iframeMatch) {
        let embedUrl = iframeMatch[1];
        if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

        // Extract direct .m3u8 if present in iframe target
        if (embedUrl.includes('.m3u8')) {
          streams.push({
            file: embedUrl,
            type: 'hls',
            quality: 'auto',
            headers: { 'Referer': this.baseUrl }
          });
        } else {
          // Fetch embed player html to find .m3u8 source
          const embedRes = await fetch(embedUrl, { 
            headers: { 'Referer': this.baseUrl, 'User-Agent': this.headers['User-Agent'] } 
          });
          const embedHtml = await embedRes.text();
          
          const m3u8Match = embedHtml.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
          if (m3u8Match) {
            streams.push({
              file: m3u8Match[1],
              type: 'hls',
              quality: 'auto',
              headers: { 'Referer': embedUrl }
            });
          }
        }
      }

      return streams;
    } catch (error) {
      console.error('[AniChan Error - getStreams]:', error);
      return [];
    }
  }
}

// Export Module untuk Nuvio Provider Engine
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AniChanProvider;
} else if (typeof window !== 'undefined') {
  window.AniChanProvider = AniChanProvider;
}
