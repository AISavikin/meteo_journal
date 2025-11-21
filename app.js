// Регистрация Service Worker с усиленной обработкой ошибок
if ('serviceWorker' in navigator) {
    const swUrl = './service-worker.js';
    
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(swUrl)
            .then((registration) => {
                console.log('SW registered: ', registration);
                
                // Проверяем обновления
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('New service worker found:', newWorker);
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New content is available; please refresh.');
                        }
                    });
                });
            })
            .catch((registrationError) => {
                console.error('SW registration failed: ', registrationError);
            });
            
        // Обработка ошибок в уже зарегистрированном Service Worker
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('Service Worker controller changed');
        });
    });
} else {
    console.log('Service Worker not supported');
}

// app.js
class MeteoJournal {
    constructor() {
        this.storageKey = 'meteoJournalData';
        this.data = [];
        this.currentEditId = null;
        this.itemsPerPage = 20;
        this.currentPage = 0;
        
        this.initStorage();
        this.setupEventListeners();
        this.renderTable();
        this.updateConnectionStatus();
    }

    // Многоуровневое хранилище с fallback
    initStorage() {
        try {
            // 1. Пробуем localStorage
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.data = JSON.parse(saved);
                return;
            }
        } catch (e) {
            console.warn('LocalStorage недоступен:', e);
        }

        try {
            // 2. Пробуем sessionStorage
            const saved = sessionStorage.getItem(this.storageKey);
            if (saved) {
                this.data = JSON.parse(saved);
                return;
            }
        } catch (e) {
            console.warn('SessionStorage недоступен:', e);
        }

        // 3. Memory storage (уже инициализирован пустым массивом)
        console.log('Используется memory storage');
    }

    // Сохранение данных во все доступные хранилища
    saveToStorage() {
        const dataStr = JSON.stringify(this.data);
        
        try {
            localStorage.setItem(this.storageKey, dataStr);
        } catch (e) {
            console.warn('Не удалось сохранить в localStorage:', e);
        }

        try {
            sessionStorage.setItem(this.storageKey, dataStr);
        } catch (e) {
            console.warn('Не удалось сохранить в sessionStorage:', e);
        }
    }

    // Валидация данных
    validateRecord(record) {
        const errors = [];

        if (!record.station || record.station.trim() === '') {
            errors.push('Станция обязательна для заполнения');
        }

        if (!record.datetime) {
            errors.push('Дата/время обязательны');
        }

        if (record.windSpeed !== undefined && (record.windSpeed < 0 || record.windSpeed > 200)) {
            errors.push('Скорость ветра должна быть от 0 до 200 м/с');
        }

        if (record.windDirection !== undefined && (record.windDirection < 0 || record.windDirection > 360)) {
            errors.push('Направление ветра должно быть от 0 до 360°');
        }

        if (record.humidity !== undefined && (record.humidity < 0 || record.humidity > 100)) {
            errors.push('Влажность должна быть от 0 до 100%');
        }

        if (record.pressure !== undefined && (record.pressure < 800 || record.pressure > 1200)) {
            errors.push('Давление должно быть от 800 до 1200 гПа');
        }

        if (record.radiation !== undefined && record.radiation < 0) {
            errors.push('Солнечная радиация не может быть отрицательной');
        }

        return errors;
    }

    // Добавление/обновление записи
    saveRecord(recordData) {
        try {
            const errors = this.validateRecord(recordData);
            if (errors.length > 0) {
                this.showMessage(errors.join(', '), 'error');
                return false;
            }

            if (this.currentEditId) {
                // Редактирование существующей записи
                const index = this.data.findIndex(item => item.id === this.currentEditId);
                if (index !== -1) {
                    this.data[index] = { ...this.data[index], ...recordData };
                    this.showMessage('Запись обновлена', 'success');
                }
                this.currentEditId = null;
            } else {
                // Новая запись
                const newRecord = {
                    id: Date.now().toString(),
                    ...recordData,
                    createdAt: new Date().toISOString()
                };
                this.data.unshift(newRecord);
                this.showMessage('Запись добавлена', 'success');
            }

            this.saveToStorage();
            this.renderTable();
            this.resetForm();
            return true;

        } catch (error) {
            console.error('Ошибка сохранения:', error);
            this.showMessage('Ошибка сохранения', 'error');
            return false;
        }
    }

    // Удаление записи
    deleteRecord(id) {
        if (confirm('Вы уверены, что хотите удалить эту запись?')) {
            try {
                this.data = this.data.filter(item => item.id !== id);
                this.saveToStorage();
                this.renderTable();
                this.showMessage('Запись удалена', 'success');
            } catch (error) {
                console.error('Ошибка удаления:', error);
                this.showMessage('Ошибка удаления', 'error');
            }
        }
    }

    // Начало редактирования
    startEdit(id) {
        const record = this.data.find(item => item.id === id);
        if (record) {
            document.getElementById('station').value = record.station || '';
            document.getElementById('datetime').value = record.datetime ? record.datetime.slice(0, 16) : '';
            document.getElementById('windSpeed').value = record.windSpeed || '';
            document.getElementById('windDirection').value = record.windDirection || '';
            document.getElementById('temperature').value = record.temperature || '';
            document.getElementById('humidity').value = record.humidity || '';
            document.getElementById('pressure').value = record.pressure || '';
            document.getElementById('radiation').value = record.radiation || '';

            this.currentEditId = id;
            document.querySelector('button[type="submit"]').textContent = 'Обновить';
            document.querySelector('button[type="reset"]').textContent = 'Отмена';
            
            // Прокрутка к форме
            document.querySelector('.input-section').scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Сброс формы
    resetForm() {
        document.getElementById('meteoForm').reset();
        this.currentEditId = null;
        document.querySelector('button[type="submit"]').textContent = 'Сохранить';
        document.querySelector('button[type="reset"]').textContent = 'Очистить';
    }

    // Экспорт в JSON
    exportToJson() {
        try {
            const dataStr = JSON.stringify(this.data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `meteo-journal-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showMessage('Данные экспортированы', 'success');
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            this.showMessage('Ошибка экспорта', 'error');
        }
    }

    // Импорт из JSON
    importFromJson(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (!Array.isArray(importedData)) {
                    throw new Error('Файл должен содержать массив данных');
                }

                // Базовая валидация структуры
                const isValid = importedData.every(item => 
                    item.station !== undefined && item.datetime !== undefined
                );

                if (!isValid) {
                    throw new Error('Неверная структура данных в файле');
                }

                this.data = importedData;
                this.saveToStorage();
                this.renderTable();
                this.showMessage('Данные импортированы', 'success');
                
            } catch (error) {
                console.error('Ошибка импорта:', error);
                this.showMessage('Ошибка импорта: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
    }

    // Отрисовка таблицы с бесконечным скроллом
    renderTable() {
        const tbody = document.getElementById('tableBody');
        const visibleData = this.data.slice(0, (this.currentPage + 1) * this.itemsPerPage);
        
        if (visibleData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = visibleData.map(record => `
            <tr>
                <td>${this.escapeHtml(record.station)}</td>
                <td>${this.formatDateTime(record.datetime)}</td>
                <td>${record.windSpeed !== undefined ? record.windSpeed : '-'}</td>
                <td>${record.windDirection !== undefined ? record.windDirection : '-'}</td>
                <td>${record.temperature !== undefined ? record.temperature : '-'}</td>
                <td>${record.humidity !== undefined ? record.humidity : '-'}</td>
                <td>${record.pressure !== undefined ? record.pressure : '-'}</td>
                <td>${record.radiation !== undefined ? record.radiation : '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit-btn" onclick="meteoJournal.startEdit('${record.id}')" title="Редактировать">✏️</button>
                        <button class="action-btn delete-btn" onclick="meteoJournal.deleteRecord('${record.id}')" title="Удалить">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Показываем/скрываем кнопку "Загрузить еще"
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (visibleData.length < this.data.length) {
            loadMoreBtn.style.display = 'block';
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }

    // Загрузка дополнительных данных
    loadMore() {
        this.currentPage++;
        this.renderTable();
    }

    // Форматирование даты/времени БЕЗ секунд
    formatDateTime(isoString) {
        if (!isoString) return '-';
        const date = new Date(isoString);
        
        // Форматируем без секунд
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }

    // Экранирование HTML для безопасности
    escapeHtml(unsafe) {
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Показать сообщение
    showMessage(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // Мониторинг соединения
    updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        
        if (!navigator.onLine) {
            statusElement.textContent = '🔌';
            statusElement.className = 'connection-status offline';
            return;
        }

        // Симуляция проверки скорости (в реальном приложении можно использовать Navigation Timing API)
        const startTime = performance.now();
        
        fetch('/favicon.ico', { cache: 'no-cache' })
            .then(() => {
                const latency = performance.now() - startTime;
                if (latency > 2000) {
                    statusElement.textContent = '🐌';
                    statusElement.className = 'connection-status slow';
                } else {
                    statusElement.textContent = '📶';
                    statusElement.className = 'connection-status online';
                }
            })
            .catch(() => {
                statusElement.textContent = '🔌';
                statusElement.className = 'connection-status offline';
            });
    }
    clearCache() {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
            this.showMessage('Запрос на очистку кэша отправлен', 'success');
        } else {
            this.showMessage('Service Worker не доступен', 'error');
        }
    }

    // Настройка обработчиков событий
    setupEventListeners() {
        const form = document.getElementById('meteoForm');
        const currentTimeBtn = document.getElementById('currentTimeBtn');
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        const clearCacheBtn = document.getElementById('clearCacheBtn');

        // Установка текущего времени по умолчанию
        const now = new Date();
        const timezoneOffset = now.getTimezoneOffset() * 60000;
        const localISOTime = new Date(now - timezoneOffset).toISOString().slice(0, 16);
        document.getElementById('datetime').value = localISOTime;

        // Обработчик формы
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = {
                station: document.getElementById('station').value.trim(),
                datetime: document.getElementById('datetime').value,
                windSpeed: document.getElementById('windSpeed').value ? parseFloat(document.getElementById('windSpeed').value) : undefined,
                windDirection: document.getElementById('windDirection').value ? parseInt(document.getElementById('windDirection').value) : undefined,
                temperature: document.getElementById('temperature').value ? parseFloat(document.getElementById('temperature').value) : undefined,
                humidity: document.getElementById('humidity').value ? parseInt(document.getElementById('humidity').value) : undefined,
                pressure: document.getElementById('pressure').value ? parseFloat(document.getElementById('pressure').value) : undefined,
                radiation: document.getElementById('radiation').value ? parseFloat(document.getElementById('radiation').value) : undefined
            };

            this.saveRecord(formData);
        });

        // Кнопка сброса формы
        form.addEventListener('reset', () => {
            this.resetForm();
            // Восстанавливаем текущее время
            document.getElementById('datetime').value = localISOTime;
        });

        // Кнопка текущего времени
        currentTimeBtn.addEventListener('click', () => {
            const now = new Date();
            const timezoneOffset = now.getTimezoneOffset() * 60000;
            const localISOTime = new Date(now - timezoneOffset).toISOString().slice(0, 16);
            document.getElementById('datetime').value = localISOTime;
        });

        clearCacheBtn.addEventListener('click', () => this.clearCache());

        // Экспорт
        exportBtn.addEventListener('click', () => this.exportToJson());

        // Импорт
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importFromJson(e.target.files[0]);
                e.target.value = ''; // Сброс для возможности повторного выбора того же файла
            }
        });

        // Загрузка дополнительных данных
        loadMoreBtn.addEventListener('click', () => this.loadMore());

        // Слушатели изменения состояния сети
        window.addEventListener('online', () => this.updateConnectionStatus());
        window.addEventListener('offline', () => this.updateConnectionStatus());
        
        // Периодическая проверка соединения
        setInterval(() => this.updateConnectionStatus(), 30000);
    }
}

// Инициализация приложения
let meteoJournal;

document.addEventListener('DOMContentLoaded', () => {
    meteoJournal = new MeteoJournal();
});