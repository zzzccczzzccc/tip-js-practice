import { selectors } from './task-selectors.js';
import { renderTasks, renderSummary } from './task-view.js';

let tasks = [
    { id: 1, title: "Изучить основы JavaScript", completed: true, priority: "Высокий" },
    { id: 2, title: "Написать сервисный слой для задач", completed: false, priority: "Средний" },
    { id: 3, title: "Подключить интерфейс и события DOM", completed: false, priority: "Высокий" }
];

document.addEventListener('DOMContentLoaded', () => {
    const { taskForm, taskInput, taskList, prioritySelect, totalCount, completedCount } = selectors;

    function updateUI() {
        renderTasks(tasks, taskList);
        renderSummary(tasks, totalCount, completedCount);
    }

    if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = taskInput.value.trim();
            if (!title) return;
            
            const priority = prioritySelect ? prioritySelect.value : "Средний";
            tasks.push({
                id: Date.now(),
                title,
                completed: false,
                priority
            });
            taskInput.value = '';
            updateUI();
        });
    }

    if (taskList) {
        taskList.addEventListener('click', (e) => {
            const li = e.target.closest('.task-item');
            if (!li) return;
            const id = Number(li.dataset.id);

            if (e.target.classList.contains('btn-toggle')) {
                tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
                updateUI();
            }

            if (e.target.classList.contains('btn-delete')) {
                tasks = tasks.filter(t => t.id !== id);
                updateUI();
            }
        });
    }

    updateUI();
});