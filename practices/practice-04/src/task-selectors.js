// Отбор задач по фильтру. Входные данные не изменяются.

export const TASK_FILTERS = ["all", "pending", "completed"];

export function getVisibleTasks(tasks, filter = "all") {
  switch (filter) {
    case "pending":
      return tasks.filter((task) => task.completed === false);
    case "completed":
      return tasks.filter((task) => task.completed === true);
    default:
      return tasks.slice();
  }
}
