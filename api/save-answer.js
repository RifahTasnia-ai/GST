import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "answers.json";

/**
 * Generate a unique student name by checking existing submissions
 * and appending numeric suffixes if duplicates exist
 */
function getUniqueStudentName(desiredName, existingSubmissions) {
  // Get all existing student names
  const existingNames = existingSubmissions.map(sub => sub.studentName);

  // If the desired name doesn't exist, use it as-is
  if (!existingNames.includes(desiredName)) {
    return desiredName;
  }

  // Find all names that match the pattern: desiredName, desiredName_1, desiredName_2, etc.
  const namePattern = new RegExp(`^${desiredName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(_\\d+)?$`);
  const matchingNames = existingNames.filter(name => namePattern.test(name));

  // Extract suffix numbers from matching names
  const suffixNumbers = matchingNames.map(name => {
    const match = name.match(/_(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  });

  // Find the next available suffix
  const nextSuffix = Math.max(...suffixNumbers) + 1;
  return `${desiredName}_${nextSuffix}`;
}

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

  // --- CLEANUP LOGIC REMOVED ---
  // We want to keep all answers permanently.
  // const TEN_MINUTES_MS = 10 * 60 * 1000;
  // const now = Date.now();
  // const filteredData = currentData.filter(...)
  const filteredData = currentData;

  // Generate unique student name before saving
  const uniqueName = getUniqueStudentName(data.studentName, filteredData);
  const dataToSave = { ...data, studentName: uniqueName };

  filteredData.push(dataToSave);
  await fs.writeFile(filePath, JSON.stringify(filteredData, null, 2));

  return { originalName: data.studentName, savedName: uniqueName };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  if (!body.studentName) {
    return res.status(400).json({ error: "studentName required" });
  }

  if (!process.env.VERCEL_ENV) {
    try {
      const result = await saveLocally(body);
      console.log(`Saved submission: "${result.originalName}" as "${result.savedName}"`);
      return res.status(200).json({
        success: true,
        savedName: result.savedName,
        wasRenamed: result.originalName !== result.savedName
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to save answer locally" });
    }
  }

  if (!OWNER || !REPO || !TOKEN) {
    return res.status(500).json({
      error: "Missing GitHub configuration",
      required: ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"],
    });
  }

  try {
    const { content, sha } = await fetchFile();
    const list = Array.isArray(content) ? content : [];

    // --- CLEANUP LOGIC REMOVED ---
    // We want to keep all answers permanently.
    // const TEN_MINUTES_MS = 10 * 60 * 1000;
    // const now = Date.now();
    // const filteredList = list.filter(...)
    const filteredList = list;

    // Generate unique student name before saving (using filtered list)
    const uniqueName = getUniqueStudentName(body.studentName, filteredList);
    const dataToSave = { ...body, studentName: uniqueName };

    filteredList.push(dataToSave);

    const updated = JSON.stringify(filteredList, null, 2);
    await updateFile(updated, sha);

    console.log(`Saved submission: "${body.studentName}" as "${uniqueName}".`);
    return res.status(200).json({
      success: true,
      savedName: uniqueName,
      wasRenamed: body.studentName !== uniqueName
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save answer" });
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
        message: "chore: append exam submission",
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
