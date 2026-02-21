import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "pending-students.json";

async function saveLocally(data) {
  const filePath = path.join(process.cwd(), FILE_PATH);
  let currentData = [];
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    currentData = JSON.parse(fileContent);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  // --- CLEANUP LOGIC ---
  // Remove pending students older than 61 minutes (exam timeout)
  const TIMEOUT_MS = 61 * 60 * 1000;
  const now = Date.now();
  const filteredData = currentData.filter(item => {
    if (!item || typeof item !== 'object') return false;
    if (!item.timestamp) return false;
    const itemTime = new Date(item.timestamp).getTime();
    if (isNaN(itemTime)) return false;
    return (now - itemTime) < TIMEOUT_MS;
  });

  // Check for duplicates in the filtered data
  const existingIndex = filteredData.findIndex(
    item => item.studentName === data.studentName
  );

  if (existingIndex === -1) {
    filteredData.push(data);
  } else {
    // Update progress fields for existing student (heartbeat) but KEEP original timestamp
    const originalTimestamp = filteredData[existingIndex].timestamp;
    filteredData[existingIndex] = { ...filteredData[existingIndex], ...data, timestamp: originalTimestamp };
  }

  await fs.writeFile(filePath, JSON.stringify(filteredData, null, 2));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  if (!body.studentName) {
    return res.status(400).json({ error: "studentName required" });
  }

  // ALWAYS use server timestamp to avoid client clock-skew issues
  const serverTimestamp = new Date().toISOString();

  const pendingStudent = {
    studentName: body.studentName,
    timestamp: serverTimestamp,
    status: "Pending",
    answers: body.answers || {},
    currentQuestion: body.currentQuestion || 0,
    answeredCount: body.answeredCount || 0,
    totalQuestions: body.totalQuestions || 0,
    questionFile: body.questionFile || 'questions.json'
  };

  if (!process.env.VERCEL_ENV) {
    try {
      await saveLocally(pendingStudent);
      return res.status(200).json({ success: true, serverTimestamp });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to save pending student locally" });
    }
  }

  if (!OWNER || !REPO || !TOKEN) {
    return res.status(500).json({ error: "Missing GitHub configuration" });
  }

  try {
    const { content, sha } = await fetchFile();
    const list = Array.isArray(content) ? content : [];

    // --- CLEANUP LOGIC ---
    // Remove pending students older than 61 minutes (exam timeout)
    const TIMEOUT_MS = 61 * 60 * 1000;
    const now = Date.now();
    const filteredList = list.filter(item => {
      if (!item || typeof item !== 'object') return false;
      if (!item.timestamp) return false;
      const itemTime = new Date(item.timestamp).getTime();
      if (isNaN(itemTime)) return false;
      return (now - itemTime) < TIMEOUT_MS;
    });

    // Check for duplicates
    const existingIndex = filteredList.findIndex(
      item => item.studentName === pendingStudent.studentName
    );

    if (existingIndex === -1) {
      filteredList.push(pendingStudent);
    } else {
      // Update progress fields for heartbeat but KEEP original timestamp
      const originalTimestamp = filteredList[existingIndex].timestamp;
      filteredList[existingIndex] = { ...filteredList[existingIndex], ...pendingStudent, timestamp: originalTimestamp };
    }

    const updated = JSON.stringify(filteredList, null, 2);
    await updateFile(updated, sha);

    return res.status(200).json({ success: true, serverTimestamp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save pending student" });
  }
}

async function fetchFile() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Could not read error');
    if (res.status === 404) {
      return { content: [], sha: undefined };
    }
    throw new Error(`GitHub fetch failed: ${res.status}`);
  }

  try {
    const data = await res.json();
    const decoded = Buffer.from(data.content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded || "[]");
    return { content: parsed, sha: data.sha };
  } catch (parseErr) {
    throw parseErr;
  }
}

async function updateFile(content, sha) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  let res;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message: "chore: add pending student",
        content: Buffer.from(content).toString("base64"),
        branch: BRANCH,
        sha,
      }),
    });
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub update failed: ${res.status} ${text}`);
  }
}
