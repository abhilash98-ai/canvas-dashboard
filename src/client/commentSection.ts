import type { AssignmentComment } from "../shared/hiding.js";
import { MAX_COMMENT_LENGTH } from "../shared/hiding.js";

export interface CommentSectionOptions {
  assignmentId: number;
  assignmentName: string;
  comments: AssignmentComment[];
  // Text typed but not yet added, kept across the list redrawing.
  draft: string;
  onDraftChange(text: string): void;
  onAdd(text: string): void;
  onDelete(comment: AssignmentComment): void;
}

function renderComment(
  comment: AssignmentComment,
  onDelete: (comment: AssignmentComment) => void,
): HTMLLIElement {
  const text = document.createElement("p");
  text.className = "comment-text";
  text.textContent = comment.text;

  const date = document.createElement("time");
  date.className = "comment-date";
  date.dateTime = comment.createdAt;
  date.textContent = new Date(comment.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "comment-delete";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => onDelete(comment));

  const details = document.createElement("div");
  details.className = "comment-details";
  details.append(date, deleteButton);

  const item = document.createElement("li");
  item.append(text, details);
  return item;
}

export function renderCommentSection(options: CommentSectionOptions): HTMLFormElement {
  const list = document.createElement("ul");
  list.className = "comment-list";
  list.append(...options.comments.map((comment) => renderComment(comment, options.onDelete)));

  const box = document.createElement("textarea");
  box.className = "comment-box";
  box.rows = 2;
  box.maxLength = MAX_COMMENT_LENGTH;
  box.placeholder = "Add a comment";
  box.value = options.draft;
  box.dataset.commentFor = String(options.assignmentId);
  box.setAttribute("aria-label", `Add a comment on ${options.assignmentName}`);

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "chip-button";
  addButton.textContent = "Add comment";
  addButton.disabled = box.value.trim() === "";

  box.addEventListener("input", () => {
    addButton.disabled = box.value.trim() === "";
    options.onDraftChange(box.value);
  });

  const form = document.createElement("form");
  form.className = "comments";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (box.value.trim() !== "") {
      options.onAdd(box.value);
    }
  });
  form.append(list, box, addButton);
  return form;
}
