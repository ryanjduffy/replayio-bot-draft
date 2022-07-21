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
const { testRunUpdateComment } = require("./comment");

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
});

async function handleTestRunUpdate(req, res, event) {
  const {old, new: current} = event.data || {};

  if (!current.repository || !current.merge_id) {
    // no PR associated with the test run
    console.log("No PR associated with test run", current.id);
    return 0;
  }

  let prNumber = Number.parseInt(current.merge_id);
  if (isNaN(prNumber)) {
    console.log("merge_id is not a number");
    return -1;
  }

  const [owner, repo] = current.repository.split("/");
  if (!owner || !repo) {
    console.log("Repository", current.repository, "was invalid");

    return -1;
  }

  const octokit = await getRepoOctokit(owner, repo);
  await testRunUpdateComment(octokit, owner, repo, prNumber, event);
}
  

app.get("/", (req, res) => res.send("App is working"));
app.use(createNodeMiddleware(bot, {probot}));
app.post("/event", express.json({ limit: "50mb" }),
async (req, res) => {
  let status = 200;
  const sendStatus = (n) => {
    status = n;
    res.sendStatus(n);
  }

  try {
    const event = req.body?.event || {};
    const name = req.body?.trigger?.name;

    console.group(`>> /event (name: ${name})`);

    let result = 0;
    if (name === "test_run_update") {
      result = await handleTestRunUpdate(req, res, event);
    }

    // non-zero response means an input error
    if (result) {
      sendStatus(400);
    } else {
      sendStatus(200);
    }
  } catch (e) {
    console.error(e);

    sendStatus(500);
  } finally {
    console.groupEnd();
    console.log(`<< /event (${status})`);
  }
});

const port = process.env.PORT || 8081;
app.listen(port, () => console.log(`Listening on ${port}`));
