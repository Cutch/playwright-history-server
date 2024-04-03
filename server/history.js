import { postgres } from './postgres.js';

export const getHistory = async (req, res) => {
  const { run, file, environment } = req.query;
  const client = await postgres.connect();
  try {
    // const maxRun = 'run_' + new Date(new Date(run.split('_')[1]).getTime() - 2628000000).toISOString().split('T')[0] + run.split('_')[2];
    const { rows } = await client.query(
      `SELECT "startTime" - INTERVAL '1 month' as "monthBefore"
      FROM runs
      WHERE "runName" = $1 AND environment = $2
      LIMIT 1`,
      [run, environment],
    );
    if (!rows[0]) return res.status(500).send({ success: false });
    const [{ monthBefore }] = rows;
    const {
      rows: [{ maxTime, minTime }],
    } = await client.query(
      `SELECT MAX("startTime") as "maxTime", MIN("startTime") as "minTime"
        FROM runs
        WHERE "runName" <= $1 AND "startTime" > $2 AND environment = $3`,
      [run, monthBefore, environment],
    );
    // const results = await client.query(`SELECT * FROM runs WHERE "testFileName" = $1 AND "runName" = $2`, [file, run]);
    const results = (
      await client.query(
        `SELECT
          "testName", "projectName",
          array_agg("runName") as "runList",
          array_agg("outcome") as outcomes,
          array_agg("startTime") as times,
          array_agg("testId") as "testIds"
        FROM runs
        WHERE "testFileName" = $1 AND "runName" <= $2 AND "startTime" > $3 AND environment = $4
        GROUP BY "testName", "projectName"`,
        [file, run, monthBefore, environment],
      )
    ).rows.map((row) => ({
      testName: row.testName,
      projectName: row.projectName,
      maxTime,
      minTime,
      outcomeHistory: row.runList
        .map((run, i) => ({ run, outcome: row.outcomes[i], time: row.times[i], testId: row.testIds[i] }))
        .sort((a, b) => b.run.localeCompare(a.run)),
    }));

    res.send({ results });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};
export const bulkLoadHistory = async (req, res) => {
  const { data } = req.body;
  const client = await postgres.connect();
  try {
    for (const { title, testId, run, file, outcome, projectName, startTime, environment } of data) {
      await client.query(
        `INSERT INTO runs
        ("testName", "testId", "runName", "testFileName", "outcome", "projectName", "startTime", environment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT ("runName", "testName", "projectName")
        DO UPDATE SET "testId"=$2, "testFileName"=$4, "outcome"=$5`,
        [title, testId, run, file, outcome, projectName, startTime, environment],
      );
    }

    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    client.release();
  }
};
