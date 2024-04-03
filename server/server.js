'use strict';
import config from './config.js';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import helmet from 'helmet';
import http from 'http';
import fileUpload from 'express-fileupload';
import { fileURLToPath } from 'node:url';
import { bulkLoadHistory, getHistory } from './history.js';
import { addComment, editComment, getComments, getCommentsStatuses, getLatestComments, getReplies, resolveComment } from './comments.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.ckeditor.com/'],
        'style-src': ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);
app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
app.use(compression());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));
app.enable('trust proxy');
app.disable('x-powered-by');

app.get(`/api/ping`, (req, res) => res.send('pong'));

app.get(`/api/history`, getHistory);
app.post(`/api/history/bulk`, bulkLoadHistory);

app.get(`/api/comment/replies`, getReplies);
app.get(`/api/comment/latest`, getLatestComments);
app.get(`/api/comment/test-comments`, getComments);
app.get(`/api/comment/run-comments`, getCommentsStatuses);
app.post(`/api/comment/add`, addComment);
app.post(`/api/comment/edit`, editComment);
app.post(`/api/comment/resolve`, resolveComment);

app.post(
  '/api/upload',
  fileUpload({
    useTempFiles: false,
    createParentPath: true,
    safeFileNames: true,
    preserveExtension: 4,
  }),
  async function (req, res) {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send({ success: false });
    }
    const { environment, runName } = req.query;
    for (const file of Object.values(req.files)) {
      await fs.mkdir(path.join(__dirname, '../public', environment, runName), { recursive: true });
      await file.mv(path.join(__dirname, '../public', environment, runName, file.name));
    }
    res.send({ success: true });
  },
);

app.use(express.static(path.join(__dirname, '../public'), { index: false }));

app.get('/:environment?', async (req, res) => {
  if (!res.headersSent) {
    const environment = req.params.environment;
    const directories = (
      await fs.readdir(path.join(__dirname, environment ? '../public/' + environment : '../public/'), { withFileTypes: true })
    )
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    res.send(
      `<html><head>
      <style>a {display: block;padding: 0.5rem 1rem;border: 1px solid #30363d;border-radius: 10px;background: #292929;color: #c9d1d9;text-decoration: none;}</style>
      </head>
      <body style="background: #121212;">
      <div style="display: flex;gap: 1rem;flex-direction: row;flex-wrap: wrap;">
      ${directories.map((d) => `<a href="./${d}/">${d}</a>`).join('')}</div></body></html>`,
    );
  }
});

app.get('/:environment/:runName/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, req, res, next) => {
  if (err) {
    res.status(err.status ?? 500).send({ nessage: err.message, stack: err.stack });
  }
});

const server = http
  .createServer(app)
  .listen(config.express.port, () =>
    console.log(`Listening on ${server.address().address == '::' ? '0.0.0.0' : server.address().address}:${config.express.port}`),
  );

process.on('SIGINT', function () {
  server.close();
});
