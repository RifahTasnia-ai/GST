import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "answers.json";

async function deleteStudentLocally(studentName) {
  const filePath = path.join(process.cwd(), FILE_PATH);
  let currentData = [];
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    currentData = JSON.parse(fileContent);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { success: false, error: "File not found" };
    }
    throw error;
  }

  const filtered = currentData.filter(
    (item) => item.studentName !== studentName
  );

  if (filtered.length === currentData.length) {
    return { success: false, error: "Student not found" };
  }

  await fs.writeFile(filePath, JSON.stringify(filtered, null, 2));
  return { success: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey && req.headers["x-admin-key"] !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { studentName } = req.body || {};
  if (!studentName) {
    return res.status(400).json({ error: "studentName required" });
  }

  if (!process.env.VERCEL_ENV) {
    try {
      const result = await deleteStudentLocally(studentName);
      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Failed to delete student locally" });
    }
  }

  if (!OWNER || !REPO || !TOKEN) {
    return res.status(500).json({ error: "Missing GitHub configuration" });
  }

  try {
    const { content, sha } = await fetchFile();
    const list = Array.isArray(content) ? content : [];

    // Remove all submissions for the student
    const filtered = list.filter(
      (item) => item.studentName !== studentName
    );

    if (filtered.length === list.length) {
      return res.status(404).json({ error: "Student not found" });
    }

    const updated = JSON.stringify(filtered, null, 2);
    await updateFile(updated, sha);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete student submissions" });
  }
}

async function fetchFile() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      return { content: [], sha: undefined };
    }
    throw new Error(`GitHub fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const decoded = Buffer.from(data.content, "base64").toString("utf8");
  const parsed = JSON.parse(decoded || "[]");
  return { content: parsed, sha: data.sha };
}

async function updateFile(content, sha) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: "chore: delete all submissions for a student",
      content: Buffer.from(content).toString("base64"),
      branch: BRANCH,
      sha,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub update failed: ${res.status} ${text}`);
  }
}
