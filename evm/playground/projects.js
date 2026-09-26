const projectList = document.getElementById("project-list");
const compactProjects = projectList.dataset.compact === "true";
const directoryStatus = document.getElementById("directory-status");

function publicLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function projectAnchor(label, href) {
  const link = document.createElement("a");
  link.textContent = label;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

async function loadProjects() {
  try {
    const response = await fetch("/projects.json");
    if (!response.ok) throw new Error("Directory unavailable");
    const directory = await response.json();
    if (!Array.isArray(directory.projects)) throw new Error("Invalid directory");
    projectList.replaceChildren();
    let liveCount = 0;
    for (const project of directory.projects) {
      const projectUrl = publicLink(project.url);
      const evidenceUrl = publicLink(project.evidenceUrl);
      const auctionUrl = publicLink(project.auctionUrl);
      if (!projectUrl || !evidenceUrl) continue;
      if (project.stage === "live" && auctionUrl) liveCount++;
      const card = document.createElement("article");
      card.className = "project-card";
      const heading = document.createElement(compactProjects ? "h3" : "h2");
      if (compactProjects) heading.append(projectAnchor(project.name, projectUrl));
      else heading.textContent = project.name;
      const top = document.createElement("p");
      top.className = "project-card-top";
      top.textContent = compactProjects ? project.stageLabel : `${project.stageLabel} · ${project.integrationLabel}`;
      const summary = document.createElement("p");
      summary.textContent = compactProjects ? (project.shortSummary ?? project.summary) : project.summary;
      if (compactProjects) {
        const titleRow = document.createElement("div");
        titleRow.className = "project-title-row";
        titleRow.append(heading, top);
        card.append(titleRow, summary);
        if (project.stage === "live" && auctionUrl) card.append(projectAnchor("Auction ↗", auctionUrl));
        projectList.append(card);
        continue;
      }
      const meta = document.createElement("div");
      meta.className = "project-meta";
      const check = document.createElement("span");
      check.textContent = `Checked ${project.checkedAt}`;
      meta.append(projectAnchor("Project ↗", projectUrl), projectAnchor("Evidence ↗", evidenceUrl), check);
      if (auctionUrl) meta.append(projectAnchor("Auction ↗", auctionUrl));
      card.append(heading, top, summary, meta);
      projectList.append(card);
    }
    if (!projectList.children.length) throw new Error("No valid entries");
    if (liveCount > 0) directoryStatus.textContent = `${liveCount} project auction${liveCount === 1 ? "" : "s"} listed as live.`;
  } catch {
    projectList.replaceChildren();
    const error = document.createElement("p");
    error.textContent = "Project notes are unavailable right now. You can still explore the source or suggest a project on GitHub.";
    projectList.append(error);
  }
}

loadProjects();
