// using Twilio SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs
// javascript

// const Sentry = require("@sentry/node");
// const Tracing = require("@sentry/tracing");
const express = require("express");
const { Probot, createNodeMiddleware } = require("probot");
const env = require("dotenv");

const bot = require("./index");

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
app.post("/event", (req, res) => {
  console.log("==== New Request ====");
  console.log(req.body);

  res.send(200);
});

const port = process.env.PORT || 8081;
app.listen(port, () => console.log(`Listening on ${port}`));
