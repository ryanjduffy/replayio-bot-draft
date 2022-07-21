// using Twilio SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs
// javascript

// const Sentry = require("@sentry/node");
// const Tracing = require("@sentry/tracing");
const express = require("express");
const { Probot, createNodeMiddleware } = require("probot");
const env = require("dotenv");

const bot = require("./bot");
const { getRepoOctokit } = require("./octokit");
const { addOrUpdateComment } = require("./comment");

env.config();
const app = express();

// only run on replit
// if (process.env.REPL_ID) {
//   Sentry.init({
//     dsn: "https://8cd0d3fc539443fc853b677807c149d0@o437061.ingest.sentry.io/6019865",
//     integrations: [
//       new Sentry.Integrations.Http({ tracing: true }),
//       new Tracing.Integrations.Express({ app }),
//     ],
//     tracesSampleRate: 1.0,
//   });

//   app.use(Sentry.Handlers.requestHandler());
//   app.use(Sentry.Handlers.tracingHandler());
// }

const probot = new Probot({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
  secret: process.env.WEBHOOK_SECRET,
})

app.get("/", (req, res) => res.send("App is working"));
app.use(createNodeMiddleware(bot, {probot}));
app.post("/event", express.json({ limit: "50mb" }),
async (req, res) => {
  const event = req.body?.event || {};
  const op = event.op;
  const {old, new: current} = event.data || {};

  if (!current.repository || !current.merge_id) {
    // no PR associated with the test run
    console.log("No PR associated with test run", current.id);
    res.sendStatus(200);

    return;
  }

  let prNumber = Number.parseInt(current.merge_id);
  if (isNaN(prNumber)) {
    console.log("merge_id is not a number");
    res.sendStatus(400);

    return;
  }

  const [owner, repo] = current.repository.split("/");
  if (!owner || !repo) {
    console.log("Repository", current.repository, "was invalid");
    res.sendStatus(400);

    return;
  }

  let comment = current.passed_count + " / " + current.failed_count
  if (op === "INSERT") {
    // new test run
    comment = "New: " + comment;
  } else if (old.status !== current.status) {
    // pending -> complete
    comment = current.status + ": " + comment;
  } else if (old.passed_count !== current.passed_count || old.failed_count !== current.failed_count) {
    // in progress update
    comment = "Update: " + comment;
  }

  const octokit = await getRepoOctokit(owner, repo);
  await addOrUpdateComment(octokit, owner, repo, prNumber, comment);

  res.sendStatus(200);
});

const port = process.env.PORT || 8081;
app.listen(port, () => console.log(`Listening on ${port}`));
