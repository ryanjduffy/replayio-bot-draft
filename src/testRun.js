const fetch = require("node-fetch");
const dedent = require("dedent");
const {createIntl} = require("@formatjs/intl");

const { addOrUpdateComment } = require("./comment");

function buildId(prefix, id) {
  return Buffer.from(prefix + ":" + id).toString("base64");
}

async function fetchTestRunRecordings(testRunId) {
  const resp = await fetch('https://api.replay.io/v1/graphql', {
    method: "POST",
    body: JSON.stringify({
      query: `query GetTestRunRecordings($uuid: UUID!, secret: String!) {
        testRun(uuid: $uuid, secret: $secret) {
          recordings {
            edges {
              node {
                id
                title
                metadata
              }
            }
          }
        }
      }`,
      variables: {
        uuid: testRunId,
        secret: process.env.BACKEND_ADMIN_API_SECRET,
      }
    })
  });

  const json = await resp.json();

  if (json.errors) {
    throw new Error(json.errors[0]?.message || "Unexpected error");
  }

  const testRun = json.data.testRun;

  if (!testRun) {
    throw new Error("Test run not found");
  }

  return testRun.recordings.edges.map(e => e.node);
}

async function generateTestRunComment(workspaceUuid, testRunId) {
  const recordings = fetchTestRunRecordings(testRunId);

  const intl = createIntl(
    {
      locale: 'en',
      messages: {
        summaryMessage: {
          id: "summary",
          defaultMessage: `We uploaded **{count, plural,
              one {# replay}
              other {# replays}
            }** linked below.`
        },
        testRunMessage: {
          id: "test-run",
          defaultMessage: `View [test run on Replay ↗︎]({link})`
        },
      },
    }
  )

  if (!recordings || recordings.length === 0) {
    console.log("No recordings created");
    return;
  }

  let formattedTestRunMessage = "";
  if (testRunId && workspaceUuid) {
    formattedTestRunMessage = intl.formatMessage(intl.messages.testRunMessage, {
      link: `https://app.replay.io/team/${buildId(workspaceUuid)}/runs/${testRunId}`
    });
  }


  // const commitTitle = recordings[0].metadata.source.commit.title;
  const commitId = recordings[0].metadata.source?.commit?.id;
  const failedRecordings = recordings.filter(r => r.metadata.test.result && r.metadata.test.result !== "passed");
  const passedRecordings = recordings.filter(r => r.metadata.test.result && r.metadata.test.result === "passed");

  return dedent`# [![logo](https://static.replay.io/images/logo-horizontal-small-light.svg)](https://app.replay.io)

  **${recordings.length} replays** were recorded${
    commitId ? ` for ${commitId}` : ""
  }.

  ${generateDetailsString(failedRecordings, false)}
  ${generateDetailsString(passedRecordings, true)}

  ${formattedTestRunMessage}
  `;
}

function generateDetailsString(recordings, isPassed) {
  const summary = isPassed ? 
    dedent`
      <summary>
          <img width="14" alt="image" src="https://user-images.githubusercontent.com/15959269/177834869-851c4e78-e9d8-4ea3-bc1d-5bc372ab593a.png">
          <b>${recordings.length} Passed</b>
        </summary>
    ` : 
    dedent`
      <summary>
        <img width="14" alt="image" src="https://user-images.githubusercontent.com/15959269/177835072-8cafcea8-146d-410a-b02e-321390e8bd95.png">    
        <b>${recordings.length} Failed</b>
      </summary>
    `;
  
  return dedent`
    <details ${!isPassed && "open"}>
      ${summary}
      ${generateRecordingListString(recordings)}
    </details>
  `;
}

function generateRecordingListString(recordings) {
  return dedent`
  <ul>
    ${
      recordings
      .map(
        ({ id, metadata: { title } }) => `<li><a href=https://app.replay.io/recording/${id}>${title || id}</a></li>`
      )
      .join("\n")
    }
  </ul>
  `
}


const testRunUpdateComment = async (octokit, owner, name, number, event) => {
  const op = event.op;
  const {old, new: current} = event.data || {};

  if (!current.workspace_id) {
    console.log("Test run does not belong to a workspace");

    return;
  }

  const comment = await generateTestRunComment(current.workspace_id, current.id);

  // let comment = current.passed_count + " / " + current.failed_count
  // if (op === "INSERT") {
  //   // new test run
  //   comment = "New: " + comment;
  // } else if (old.status !== current.status) {
  //   // pending -> complete
  //   comment = current.status + ": " + comment;
  // } else if (old.passed_count !== current.passed_count || old.failed_count !== current.failed_count) {
  //   // in progress update
  //   comment = "Update: " + comment;
  // }

  if (comment) {
    await addOrUpdateComment(octokit, owner, name, number, comment)
  }
}


module.exports = {
  testRunUpdateComment
};
