const BOT_LOGIN = "replayio-bot-draft";

const findComment = async (context, owner, repo, number) => {
  let id = null;
  let comment = null;

  let totalCount = null;
  let cursor = null;
  let visited = 0;
  while(true) {
    const results = await context.octokit.graphql(`
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

const addComment = async (context, subjectId) => {
  return await context.octokit.graphql(`
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

const updateComment = async (context, commentId) => {
  return await context.octokit.graphql(`
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

const handlePullRequest = async (context) => {
  const {id, comment} = await findComment(
    context,
    context.payload.repository.owner.login,
    context.payload.repository.name,
    context.payload.pull_request.number
  );

  if (!id) {
    throw new Error("Unable to find Pull Request");
  }

  if (!comment) {
    await addComment(context, id);
  } else {
    await updateComment(context, comment);
  }
}

module.exports = (app) => {
  app.on("pull_request.reopened", handlePullRequest);
  app.on("pull_request.opened", handlePullRequest);
};
