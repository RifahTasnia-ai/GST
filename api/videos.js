const TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = "2ace187471b6aede8e81bac3c01067d2";

function parseVideos(content) {
    const parsed = JSON.parse(content || "[]");
    return Array.isArray(parsed) ? parsed : [];
}

async function fetchGistContent() {
    const url = `https://api.github.com/gists/${GIST_ID}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json"
        }
    });

    if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`GitHub Gist fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const fileContent = data.files['videos.json']?.content || '[]';
    return parseVideos(fileContent);
}

async function updateGistVideos(videos) {
    const url = `https://api.github.com/gists/${GIST_ID}`;
    const body = {
        files: {
            "videos.json": { content: JSON.stringify(videos, null, 2) }
        }
    };

    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text();
        const err = new Error(`GitHub Gist update failed: ${res.status} ${text}`);
        err.status = res.status;
        err.details = text;
        throw err;
    }
}

export default async function handler(req, res) {
    if (!TOKEN) {
        return res.status(500).json({ error: "Missing GitHub configuration (GITHUB_TOKEN)" });
    }

    try {
        // GET: Fetch videos
        if (req.method === "GET") {
            const videos = await fetchGistContent();
            return res.status(200).json(videos);
        }

        // POST: Add video
        if (req.method === "POST") {
            const { video } = req.body || {};
            if (!video || !video.id) {
                return res.status(400).json({ error: "Valid video object with id is required" });
            }

            const videos = await fetchGistContent();
            if (videos.some((item) => item.id === video.id)) {
                return res.status(409).json({ error: "Video with this id already exists" });
            }

            videos.push(video);
            await updateGistVideos(videos);
            return res.status(200).json({ success: true });
        }

        // DELETE: Delete video
        if (req.method === "DELETE") {
            const { id } = req.body || {};
            if (!id) {
                return res.status(400).json({ error: "Video id is required" });
            }

            const videos = await fetchGistContent();
            const updated = videos.filter((v) => v.id !== id);

            if (updated.length === videos.length) {
                return res.status(200).json({ success: true, deleted: false });
            }

            await updateGistVideos(updated);
            return res.status(200).json({ success: true, deleted: true });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("api/videos error:", err);
        return res.status(500).json({ error: "Operation failed", details: err.message });
    }
}
