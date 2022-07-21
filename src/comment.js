const BOT_LOGIN = "replayio-bot-draft";

const findComment = async (octokit, owner, repo, number) => {
  let id = null;
  let comment = null;

  let totalCount = null;
  let cursor = null;
  let visited = 0;
  while(true) {
    const results = await octokit.graphql(`
      query FindComment($owner: String!, $repo: String!, $number: Int!, $cursor: String) { 
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            id
            comments(first: 50, after: $cursor) {
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
      owner,
      repo,
      number,
      cursor,
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

const addComment = async (octokit, subjectId, body) => {
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
    body,
    headers: {
      accept: "application/vnd.github.elektra-preview+json",
    },
  });
};

const updateComment = async (octokit, commentId, body) => {
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
    body,
    headers: {
      accept: "application/vnd.github.elektra-preview+json",
    },
  });
};

const addOrUpdateComment = async(octokit, owner, name, number, body) => {
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
    return await addComment(octokit, id, body);
  } else {
    return await updateComment(octokit, comment, body);
  }
}

const testRunUpdateComment = async (octokit, owner, name, number, event) => {
  const op = event.op;
  const {old, new: current} = event.data || {};

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

  if (comment) {
    await addOrUpdateComment(octokit, owner, name, number, comment)
  }
}

module.exports = {
  addOrUpdateComment,
  updateComment,
  findComment,
  addComment,
  testRunUpdateComment,
};
