const { addOrUpdateComment } = require("./comment");

const handlePullRequest = async (context) => {
  return addOrUpdateComment(
    context.octokit,
    context.payload.repository.owner.login,
    context.payload.repository.name,
    context.payload.pull_request.number
  );
}

module.exports = (app) => {  
  // app.on("pull_request.reopened", handlePullRequest);
  // app.on("pull_request.opened", handlePullRequest);
};
