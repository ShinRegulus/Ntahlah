/**
 * Nuvio Provider Extension: AniChan
 * Target Site: https://anichan.to
 */

const BASE_URL = 'https://anichan.to';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/'
};

class AniChanProvider {
  constructor() {
    this.id = 'anichan';
    this.name = 'AniChan';
    this.baseUrl = BASE_URL;
  }

  /**
   * Search anime by query
   * @param {string} query 
   * @returns {Promise<Array>}
   */
  async search(query) {
    try {
      const searchUrl = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, { headers });
      const html = await response.text();

      const results = [];
      // Parsing HTML search results
      const itemRegex = /<div class="flw-item">[\s\S]*?<a href="([^"]+)" class="film-poster-ahref" title="([^"]+)">[\s\S]*?<img [^>]*data-src="([^"]+)"/g;
      
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        results.push({
          id: match[1].replace('/', ''), // Path URL/Slug anime
          title: match[2].trim(),
          poster: match[3],
          type: 'tv',
          provider: this.id
        });
      }

      return results;
    } catch (error) {
      console.error('[AniChan] Search error:', error);
      return [];
    }
  }

  /**
   * Get detail information and episode list
   * @param {string} animeId 
   * @returns {Promise<Object>}
   */
  async getDetail(animeId) {
    try {
      const detailUrl = `${this.baseUrl}/${animeId}`;
      const response = await fetch(detailUrl, { headers });
      const html = await response.text();

      // Extract Title & Synopsis
      const titleMatch = html.match(/<h2 class="film-name dynamic-name">([^<]+)<\/h2>/);
      const synopsisMatch = html.match(/<div class="description">([^<]+)<\/div>/);
      const posterMatch = html.match(/<img class="film-poster-img" src="([^"]+)"/);

      const episodes = [];
      // Extract episode list
      const epRegex = /<a [^>]*href="([^"]+)" [^>]*data-number="([^"]+)" [^>]*title="([^"]*)"/g;
      
      let match;
      while ((match = epRegex.exec(html)) !== null) {
        episodes.push({
          id: match[1].replace('/', ''),
          number: parseInt(match[2], 10) || 1,
          title: match[3] ? match[3].trim() : `Episode ${match[2]}`
        });
      }

      return {
        id: animeId,
        title: titleMatch ? titleMatch[1].trim() : '',
        synopsis: synopsisMatch ? synopsisMatch[1].trim() : '',
        poster: posterMatch ? posterMatch[1] : '',
        episodes: episodes
      };
    } catch (error) {
      console.error('[AniChan] Detail error:', error);
      return null;
    }
  }

  /**
   * Extract video stream sources
   * @param {string} episodeId 
   * @returns {Promise<Array>}
   */
  async getStreams(episodeId) {
    try {
      const epUrl = `${this.baseUrl}/${episodeId}`;
      const response = await fetch(epUrl, { headers });
      const html = await response.text();

      const streams = [];

      // Look for iframe player or direct embed sources
      const iframeMatch = html.match(/<iframe [^>]*src="([^"]+)"/i);
      
      if (iframeMatch) {
        const embedUrl = iframeMatch[1];

        // Case 1: HLS / M3U8 Stream
        if (embedUrl.includes('.m3u8')) {
          streams.push({
            url: embedUrl,
            type: 'hls',
            quality: 'auto',
            headers: { 'Referer': this.baseUrl }
          });
        } 
        // Case 2: Embed Player Parsing (e.g. Megacloud / RapidCloud)
        else {
          const embedRes = await fetch(embedUrl, { headers: { 'Referer': this.baseUrl } });
          const embedHtml = await embedRes.text();
          
          const m3u8Match = embedHtml.match(/(https?:\/\/[^"]+\.m3u8)/);
          if (m3u8Match) {
            streams.push({
              url: m3u8Match[1],
              type: 'hls',
              quality: 'auto',
              headers: { 'Referer': embedUrl }
            });
          }
        }
      }

      return streams;
    } catch (error) {
      console.error('[AniChan] Stream extraction error:', error);
      return [];
    }
  }
}

// Export module untuk Nuvio Provider Runtime
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AniChanProvider;
} else {
  window.AniChanProvider = AniChanProvider;
}

