import { postgres } from './postgres.js';
import sanitizeHtml from 'sanitize-html';

export const getLatestComments = async (req, res) => {
  const { environment } = req.query;
  const client = await postgres.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT *, "replyCount"
      FROM (
        SELECT
          distinct
          COALESCE(ogc."id", uc."id") as "id",
          COALESCE(ogc."createDate", uc."createDate") as "createDate",
          COALESCE(ogc."user", uc."user") as "user",
          COALESCE(ogc."body", uc."body") as "body",
          COALESCE(ogc."status", uc."status") as "status",
          COALESCE(ogc."testName", uc."testName") as "testName",
          COALESCE(ogc."runName", uc."runName") as "runName"
        FROM comments uc
        LEFT JOIN (
          SELECT "id", "createDate", "user", "body", "status", "testName", "runName"
          FROM comments
          WHERE environment = $1 AND "isFirstComment"
        ) ogc ON ogc.id = uc."threadId"
        WHERE environment = $1
        ORDER BY COALESCE(ogc."createDate", uc."createDate") desc
        LIMIT 100
      ) r
      LEFT JOIN (
        SELECT "threadId", count(1) as "replyCount"
        FROM comments
        WHERE environment = $1 AND NOT "isFirstComment"
        GROUP BY "threadId"
      ) rc ON r.id = rc."threadId"
      ORDER BY "createDate" desc`,
      [environment],
    );

    res.send({ results: rows });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};

export const getCommentsStatuses = async (req, res) => {
  const { environment } = req.query;
  const client = await postgres.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT "testName", "runName", "status"
      FROM comments c
      WHERE environment = $1 AND "isFirstComment" AND (status != 'unresolved' OR EXISTS (SELECT 1 from runs WHERE "createDate" > NOW() - INTERVAL '1 month' AND "runName" = c."runName"))`,
      [environment],
    );

    res.send({ results: rows });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};

export const getComments = async (req, res) => {
  const { environment, testName, runName } = req.query;
  const client = await postgres.connect();
  try {
    const { rows } = await client.query(
      `SELECT
        "id",
        "createDate",
        "user",
        "body",
        "status"
      FROM comments
      WHERE environment = $1 AND "testName" = $2 AND "runName" = $3
      ORDER BY "createDate" asc`,
      [environment, testName, runName],
    );

    res.send({ results: rows });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};
export const getReplies = async (req, res) => {
  const { environment, id } = req.query;
  const client = await postgres.connect();
  try {
    const { rows } = await client.query(
      `SELECT
        "createDate",
        "user",
        "body",
        "status"
      FROM comments
      WHERE environment = $1 AND "threadId" = $2
      ORDER BY "createDate" asc`,
      [environment, id],
    );

    res.send({ results: rows });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};
export const addComment = async (req, res) => {
  const { environment, testName, runName, user, body } = req.body;
  const client = await postgres.connect();
  try {
    let threadId;
    const { rows: getParentId } = await client.query(
      `SELECT "id"
      FROM comments
      WHERE environment = $1 AND "testName" = $2 AND "runName" = $3`,
      [environment, testName, runName],
    );
    if (getParentId.length > 0) {
      threadId = getParentId[0].id;
    }

    await client.query(
      'INSERT INTO comments ("user", "body", "testName", "environment", "runName", "threadId", "isFirstComment") VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
      [user, sanitizeHtml(body), testName, environment, runName, threadId, threadId ? 0 : 1],
    );
    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};

export const editComment = async (req, res) => {
  const { id, body } = req.body;
  const client = await postgres.connect();
  try {
    await client.query('UPDATE comments SET "body" = $2 WHERE id = $1', [id, sanitizeHtml(body)]);

    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};

export const resolveComment = async (req, res) => {
  const { id, status } = req.body;
  const client = await postgres.connect();
  try {
    await client.query('UPDATE comments SET "status" = $2 WHERE id = $1 OR "threadId" = $1', [id, status]);

    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};
