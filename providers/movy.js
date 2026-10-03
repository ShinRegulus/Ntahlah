class MovyProvider {
  constructor() {
    this.baseUrl = "https://movy.sx";
  }

  // Melakukan pencarian film/series dengan teknik scraping halaman hasil cari
  async search(query) {
    try {
      const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(query.keyword)}`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NuvioApp",
          "Referer": this.baseUrl
        }
      });
      const html = await response.text();

      // Gunakan parser DOM internal jika lingkungan Nuvio mendukungnya, 
      // atau fallback menggunakan Regular Expression sederhana untuk mengambil elemen HTML
      const results = [];
      
      // Contoh regex generik untuk mencocokkan card film/series pada hasil pencarian HTML
      // (Sesuaikan pola regex ini dengan struktur tag HTML asli di movy.sx)
      const cardRegex = /<a[^>]+href="([^"]+)"[^>]*>.*?<img[^>]+src="([^"]+)"[^>]*>.*?<h[2-3][^>]*>(.*?)<\/h[2-3]>/gs;
      let match;

      while ((match = cardRegex.exec(html)) !== null) {
        const path = match[1];
        const poster = match[2];
        const title = match[3].replace(/<[^>]*>?/gm, "").trim();
        
        // Menentukan tipe media berdasarkan path URL (misal: /movie/... atau /tv/...)
        const type = path.includes("/tv/") || path.includes("/series/") ? "tv" : "movie";
        const id = path.split("/").filter(Boolean).pop();

        results.push({
          id: id,
          title: title,
          poster: poster,
          type: type,
          year: "" // Dapat diekstrak jika ada elemen tahun di dalam card HTML
        });
      }

      return results;
    } catch (error) {
      console.error("Gagal melakukan scraping pencarian Movy:", error);
      return [];
    }
  }

  // Mengambil detail film atau serial halaman utama dari target
  async getDetail(id, type) {
    try {
      const detailUrl = `${this.baseUrl}/${type}/${id}`;
      const response = await fetch(detailUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NuvioApp",
          "Referer": this.baseUrl
        }
      });
      const html = await response.text();

      // Ekstraksi judul halaman
      const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>?/gm, "").trim() : "Unknown";

      // Ekstraksi sinopsis/deskripsi
      const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);
      const description = descMatch ? descMatch[1] : "";

      // Ekstraksi poster
      const posterMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
      const poster = posterMatch ? posterMatch[1] : "";

      let seasons = [];
      if (type === "tv") {
        // Contoh logika sederhana mendeteksi jumlah season dari elemen pilihan/dropdown di halaman HTML
        const seasonRegex = /data-season="(\d+)"/g;
        let sMatch;
        let seasonNumbers = new Set();
        while ((sMatch = seasonRegex.exec(html)) !== null) {
          seasonNumbers.add(parseInt(sMatch[1], 10));
        }

        seasons = Array.from(seasonNumbers).map((num) => ({
          seasonNumber: num,
          episodeCount: 20 // Default estimasi atau parse dinamis dari elemen episode jika ada
        }));
      }

      return {
        id: id.toString(),
        title: title,
        description: description,
        poster: poster,
        backdrop: poster,
        type: type,
        seasons: seasons,
      };
    } catch (error) {
      throw new Error(`Gagal melakukan scraping detail untuk ID ${id}: ${error.message}`);
    }
  }

  // Mengambil tautan pemutaran (streaming links / m3u8 / embed) langsung dari halaman tonton
  async getStreams(request) {
    try {
      const { id, type, season, episode } = request;
      let watchUrl = `${this.baseUrl}/${type}/${id}`;
      
      if (type === "tv" && season && episode) {
        watchUrl += `/season-${season}-episode-${episode}`;
      }

      const response = await fetch(watchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NuvioApp",
          "Referer": this.baseUrl
        }
      });
      const html = await response.text();

      const sources = [];

      // Contoh pencarian pola iframe player atau tautan sumber video langsung (.m3u8 / .mp4) di dalam HTML
      const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
      if (iframeMatch) {
        sources.push({
          quality: "Auto (Embed)",
          url: iframeMatch[1],
          type: "iframe",
          headers: {
            "Referer": this.baseUrl
          }
        });
      }

      // Jika situs menyertakan link sumber langsung di dalam skrip JS halaman
      const m3u8Match = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
      if (m3u8Match) {
        sources.push({
          quality: "HD",
          url: m3u8Match[1],
          type: "hls",
          headers: {}
        });
      }

      return sources;
    } catch (error) {
      console.error("Gagal mengambil stream video melalui scraping:", error);
      return [];
    }
  }
}

module.exports = MovyProvider;
    
