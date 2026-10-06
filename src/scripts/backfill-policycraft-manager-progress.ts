import "dotenv/config";
import { readFile } from "node:fs/promises";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { calculatePolicyProgress } from "../lib/policycraft-progress";
import { policyCraftPool } from "../lib/db";
import type { Policy } from "../lib/types";

type Evidence = { documentId: string; managerId: number; documentVersion: number; savedAt: string };
type Candidate = RowDataPacket & {
  org_id: number; id: string; updated_by_user_id: number; title: string; policy_type: Policy["policyType"];
  lock_version: number; updated_at: Date | string; policy_json: unknown;
};

function parsePolicy(value: unknown): Policy {
  return (typeof value === "string" ? JSON.parse(value) : value) as Policy;
}

function parseEvidence(value: unknown): Evidence[] {
  if (!Array.isArray(value)) throw new Error("Evidence must be a JSON array.");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Evidence entry ${index + 1} must be an object.`);
    const item = entry as Record<string, unknown>;
    if (typeof item.documentId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.documentId)
      || !Number.isSafeInteger(item.managerId) || Number(item.managerId) < 1
      || !Number.isSafeInteger(item.documentVersion) || Number(item.documentVersion) < 1
      || typeof item.savedAt !== "string" || !Number.isFinite(Date.parse(item.savedAt))) {
      throw new Error(`Evidence entry ${index + 1} must include a UUID documentId, positive managerId and documentVersion, and valid savedAt timestamp.`);
    }
    return {
      documentId: item.documentId,
      managerId: Number(item.managerId),
      documentVersion: Number(item.documentVersion),
      savedAt: item.savedAt,
    };
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const evidenceFlag = process.argv.find((argument) => argument.startsWith("--evidence="));
  const evidencePath = evidenceFlag?.slice("--evidence=".length);
  if (!evidencePath) {
    const message = "No manager progress backfill was performed. Legacy authorship cannot be proven from document metadata alone; provide owner-verified JSON evidence with documentId, managerId, documentVersion, and savedAt for each draft.";
    if (apply) throw new Error(`${message} --apply requires --evidence=<path>.`);
    console.log(message);
    return;
  }

  const evidence = parseEvidence(JSON.parse(await readFile(evidencePath, "utf8")));
  if (evidence.length === 0) {
    console.log("No manager progress backfill candidates were supplied in the evidence file.");
    return;
  }
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    let verified = 0;
    let inserted = 0;
    for (const item of evidence) {
      const [rows] = await connection.execute<Candidate[]>(
        `SELECT d.org_id, d.id, d.updated_by_user_id, d.title, d.policy_type, d.lock_version, d.updated_at, d.policy_json
           FROM policycraft_documents d
           INNER JOIN policycraft_user_access a ON a.user_id = d.updated_by_user_id AND a.role = 'manager'
          WHERE d.id = ? AND d.updated_by_user_id = ? AND d.lock_version = ? AND d.updated_at = ? AND d.archived_at IS NULL
          LIMIT 1 FOR UPDATE`,
        [item.documentId, item.managerId, item.documentVersion, new Date(item.savedAt)],
      );
      const row = rows[0];
      if (!row || row.updated_by_user_id !== item.managerId || row.lock_version !== item.documentVersion
        || new Date(row.updated_at).getTime() !== Date.parse(item.savedAt)) continue;
      verified += 1;
      if (!apply) continue;

      const progress = calculatePolicyProgress(parsePolicy(row.policy_json));
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT IGNORE INTO policycraft_manager_progress
          (org_id, document_id, manager_user_id, title, policy_type, percentage,
           filled_sections, total_sections, sections_json, document_version, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
        [row.org_id, row.id, item.managerId, row.title, row.policy_type, progress.percentage,
          progress.filledSections, progress.totalSections, JSON.stringify(progress.sections), row.lock_version, row.updated_at],
      );
      inserted += result.affectedRows;
    }
    await connection.commit();
    if (apply) {
      console.log(`Applied ${inserted} verified manager progress baselines; ${verified - inserted} already had a preserved snapshot.`);
    } else {
      console.log(`Dry run: ${verified} owner-evidenced candidates match the current manager, document version, and saved timestamp; ${evidence.length - verified} were stale or unverifiable. Re-run with --apply --evidence=<path> to write snapshots.`);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error("PolicyCraft manager progress backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => policyCraftPool.end());
