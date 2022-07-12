const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const { Octokit, App } = require("octokit");
const { createAppAuth } = require("@octokit/auth-app");

const BOT_LOGIN = "replayio-bot-draft";

const findComment = async (octokit, owner, repo, number) => {
  let id = null;
  let comment = null;

  let totalCount = null;
  let cursor = null;
  let visited = 0;
  while(true) {
    const results = await octokit.graphql(`
      query { 
        repository(owner: "${owner}", name: "${repo}") {
          pullRequest(number: ${number}) {
            id
            comments(first: 50, after: ${cursor}) {
              totalCount
              edges {
                node {
                  id
                  author {
                    login
                  }
                }
              }
            }
          }
        }
      }
    `, {
      headers: {
        accept: "application/vnd.github.elektra-preview+json",
      },
    });

    if (results.errors) {
      throw new Error(results.errors[0]);
    }

    if (id == null) {
      id = results.repository.pullRequest.id;
    }

    const comments = results.repository.pullRequest.comments;
    if (totalCount == null) {
      totalCount = comments.totalCount;
    }

    if (comments.edges.length === 0) {
      break;
    }

    const botComment = comments.edges.find(n => n.node.author.login === BOT_LOGIN);
    if (botComment) {
      comment = botComment.node.id;
      break;
    }

    cursor = comments.edges[comments.edges.length - 1].cursor;

    visited += comments.edges.length;
    if (visited >= totalCount) {
      return {id};
    }
  }

  return {id, comment};
};

const addComment = async (octokit, subjectId) => {
  return await octokit.graphql(`
    mutation AddComment($body: String!, $subjectId: ID!) {
      addComment(input: {
        subjectId: $subjectId,
        body: $body,
      }) {
        subject {
          id
        }
      }
    }
  `, {
    subjectId,
    body: "New Comment: " + Date.now(),
    headers: {
      accept: "application/vnd.github.elektra-preview+json",
    },
  });
};

const updateComment = async (octokit, commentId) => {
  return await octokit.graphql(`
    mutation UpdateComment($body: String!, $commentId: ID!) {
      updateIssueComment(input: {
        id: $commentId,
        body: $body,
      }) {
        issueComment {
          id
        }
      }
    }
  `, {
    commentId,
    body: "Updated Comment: " + Date.now(),
    headers: {
      accept: "application/vnd.github.elektra-preview+json",
    },
  });
};

const addOrUpdateComment = async(octokit, owner, name, number) => {
  const {id, comment} = await findComment(
    octokit,
    owner,
    name,
    number
  );

  if (!id) {
    throw new Error("Unable to find Pull Request");
  }

  if (!comment) {
    return await addComment(octokit, id);
  } else {
    return await updateComment(octokit, comment);
  }
}

const handlePullRequest = async (context) => {
  return addOrUpdateComment(
    octokit,
    context.payload.repository.owner.login,
    context.payload.repository.name,
    context.payload.pull_request.number
  );
}

function createToken() {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({
    iat: now - 60,
    exp: now + (10 * 60),
    iss: process.env.APP_ID,
  }, process.env.PRIVATE_KEY, {
    algorithm: "RS256"
  });

  return token;
}

function getGitHubHeaders(token) {
  return {
    Authorization: token ? `token ${token}` : `Bearer ${createToken()}`,
    Accept: "application/vnd.github+json",
  };
}

function getOctokit(installationId) {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.APP_ID,
      privateKey: process.env.PRIVATE_KEY,
      installationId,
    },
  });
}

async function getRepoOctokit(owner, repo) {
  const installations = await fetch("https://api.github.com/app/installations", {
    headers: getGitHubHeaders()
  }).then(resp => resp.json());

  const install = installations.find(i => i.account.login === owner);
    
  if (install) {
    const installationId = install.id;

    const token = await fetch(install.access_tokens_url, {
      method: "POST",
      headers: getGitHubHeaders()
    }).then(resp => resp.json());

    const repos = await fetch(install.repositories_url, {
      headers: getGitHubHeaders(token.token),
    }).then(resp => resp.json());

    const repository = repos.repositories.find(r => r.name === repo);

    if (repository) {
      return getOctokit(installationId);
    }
  }

  return null;
}

module.exports = (app) => {
  const owner = "ryanjduffy";
  const repo = "test-pw";
  const pullRequestNumber = 11;

  getRepoOctokit(owner, repo).then(octokit => {
    if (!octokit) console.error("failed to find repo");

    return addOrUpdateComment(octokit, owner, repo, pullRequestNumber);
  }).then(console.log);
  
  app.on("pull_request.reopened", handlePullRequest);
  app.on("pull_request.opened", handlePullRequest);
};
