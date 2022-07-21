const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const { Octokit, App } = require("octokit");
const { createAppAuth } = require("@octokit/auth-app");

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

module.exports = {
  getRepoOctokit
};
