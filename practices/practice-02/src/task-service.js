import { initialTasks } from './data.js';

let tasks = [...initialTasks];

export function getTasks() {
    return tasks;
}

export function addTask(title, priority = "Средний") {
    const newTask = { id: Date.now(), title, completed: false, priority };
    tasks.push(newTask);
    return newTask;
}

export function removeTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    return tasks;
}

export function toggleTask(id) {
    tasks = tasks.map(task => 
        task.id === id ? { ...task, completed: !task.completed } : task
    );
    return tasks;
}