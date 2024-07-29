import ky from "ky";

const accessToken = process.env.GITHUB_ACCESS_TOKEN;
const repo = process.env.REPO_NAME;
const owner = process.env.REPO_OWNER;

if (!accessToken) {
  console.error("No access token provided");
  process.exit(1);
}

if (!repo) {
  console.error("No repo provided");
  process.exit(1);
}

if (!owner) {
  console.error("No owner provided");
  process.exit(1);
}

const api = ky.create({
  prefixUrl: "https://api.github.com",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

const CHECK_RUN_NAME = "Check Bitrise build status";

(async () => {
  const openPrs = await api.get(`repos/${owner}/${repo}/pulls?state=open&per_page=100`).json();
  const headCommits = openPrs.map((pr) => pr.head.sha);

  const checkRuns = await Promise.all(
    headCommits.map((sha) => api.get(`repos/${owner}/${repo}/commits/${sha}/check-runs`).json())
  );

  const failedBitriseCheckRuns = checkRuns.reduce(
    (failedCheckRuns, prCheckRuns) => {
      prCheckRuns.check_runs.forEach((checkRun) => {
        if (checkRun.name === CHECK_RUN_NAME && checkRun.conclusion === "failure") {
          failedCheckRuns.push(checkRun);
        }
      });
      return failedCheckRuns;
    },
    []
  );

  // rerun failed check run jobs
  if (failedBitriseCheckRuns.length > 0) {
    await Promise.all(
      failedBitriseCheckRuns
        .map((checkRun) => {
          console.log(`Rerunning check run ${checkRun.id}`);
          return api.post(`repos/${owner}/${repo}/actions/jobs/${checkRun.id}/rerun`).json()
        })
    );
  }

})();
