export function renderTasks(tasks, container) {
    container.innerHTML = '';
    
    if (tasks.length === 0) {
        container.innerHTML = '<li class="empty-message">Список задач пуст</li>';
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        li.dataset.id = task.id;

        li.innerHTML = `
            <span class="task-title">${task.title}</span>
            <span class="task-priority">[${task.priority}]</span>
            <div class="task-actions">
                <button class="btn-toggle">${task.completed ? 'Возобновить' : 'Готово'}</button>
                <button class="btn-delete">Удалить</button>
            </div>
        `;
        container.appendChild(li);
    });
}

export function renderSummary(tasks, totalElem, completedElem) {
    if (totalElem) totalElem.textContent = tasks.length;
    if (completedElem) {
        completedElem.textContent = tasks.filter(t => t.completed).length;
    }
}