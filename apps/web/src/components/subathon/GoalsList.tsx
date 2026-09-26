import { useCallback, useEffect, useRef } from "react";
import type { Goal } from "@subathon-goal-tracker/messages/schema";

export function GoalsList({
  goals,
  subs,
  disabled,
  onRemove,
}: {
  goals: Goal[];
  subs: number;
  disabled: boolean;
  onRemove: (goal: Goal) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLTableSectionElement>(null);
  const currentRow = useRef<HTMLTableRowElement>(null);
  const ordered = goals.toSorted((a, b) => a.target - b.target);
  const next = ordered.find((goal) => goal.target > subs);
  const currentId = (next ?? ordered.at(-1))?.id;
  const goalLayout = ordered
    .map((goal) => `${goal.id}:${goal.target}:${goal.name}`)
    .join("\n");

  const showCurrentGoal = useCallback(() => {
    const container = viewport.current;
    const row = currentRow.current;
    if (!container || !row) return;
    const headerHeight = header.current?.getBoundingClientRect().height ?? 0;
    const rowRect = row.getBoundingClientRect();
    const rowTop =
      rowRect.top - container.getBoundingClientRect().top + container.scrollTop;
    // Scroll only this list, leaving the page and keyboard focus where they are.
    container.scrollTo({
      top: Math.max(
        0,
        rowTop -
          headerHeight -
          Math.max(
            0,
            (container.clientHeight - headerHeight - rowRect.height) / 2,
          ),
      ),
      behavior: "instant",
    });
  }, []);

  useEffect(showCurrentGoal, [currentId, goalLayout, showCurrentGoal]);

  return (
    <>
      <div className="section-heading">
        <h2 id="goals-heading">
          Goals <span className="muted">{subs.toLocaleString()} subs</span>
        </h2>
        {!!goals.length && (
          <button type="button" className="secondary" onClick={showCurrentGoal}>
            {next ? "Jump to next goal" : "Show final goal"}
          </button>
        )}
      </div>
      <div
        ref={viewport}
        className="table-scroll goal-list"
        tabIndex={0}
        role="region"
        aria-label="Subathon goals"
      >
        <table>
          <thead ref={header}>
            <tr>
              <th>Goal</th>
              <th>Subs</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((goal) => (
              <tr
                key={goal.id}
                ref={goal.id === currentId ? currentRow : null}
                aria-current={goal.id === next?.id ? "step" : undefined}
                className={
                  subs >= goal.target
                    ? "reached-goal"
                    : goal.id === next?.id
                      ? "next-goal"
                      : ""
                }
              >
                <td>{goal.name}</td>
                <td>{goal.target}</td>
                <td>
                  {subs >= goal.target
                    ? "Reached"
                    : `${goal.id === next?.id ? "Next · " : ""}${goal.target - subs} to go`}
                </td>
                <td>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Remove ${goal.name}`}
                    disabled={disabled}
                    onClick={() => onRemove(goal)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!goals.length && (
              <tr>
                <td colSpan={4}>
                  Add the first goal below. Contributions are still being
                  counted.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
