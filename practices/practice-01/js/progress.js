function calculateProgress(completedTasks, totalTasks) {
    if (totalTasks === 0) return 0;
    return Math.round((completedTasks / totalTasks) * 100);
}
console.log(`Текущий прогресс: ${calculateProgress(2, 3)}%`);