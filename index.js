// App State
let appData = [];
let currentPage = 'home';
let selectedCurrency = 'USD';
let notifications = [];
let registerMode = null;

const defaultConfig = {
    app_title: 'Visión',
    app_subtitle: 'Finanzas personales',
    primary_color: '#B3428D',
    secondary_color: '#DC7240',
    background_color: '#FFFFFF',
    text_color: '#1F2937',
    surface_color: '#F9FAFB'
};

function localMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const categories = [
    'Diezmos y ofrendas', 'Alquiler de vivienda', 'Alimentos', 'Luz', 'Agua',
    'Internet', 'Teléfono', 'Educación', 'Transporte', 'Salud',
    'Vestimenta', 'Entretenimiento', 'Deudas cortas', 'Proyectos personales', 'Otros'
];

// Initialize SDKs
const dataHandler = {
    onDataChanged(data) {
        appData = data;
        loadCurrencyFromData();
        updateUI();
        checkNotifications();
        checkDailyModal();
    }
};


function mapBudgetFromSupabase(budget) {
    return {
        ...budget,
        type: 'budget',
        amount: 0,
        budgetAmount: Number(budget.budget_amount) || 0,
        isFixed: budget.is_fixed,
        paymentDate: budget.payment_day,
        otherDescription: budget.other_description || ''
    };
}


function mapTransactionFromSupabase(transaction) {
    return {
        ...transaction,
        type: transaction.type,
        date: transaction.transaction_date,
        isPartial: transaction.is_partial,
        impulsiveSpend: transaction.impulsive_spend
    };
}


function mapDailyCheckFromSupabase(dailyCheck) {
    return {
        ...dailyCheck,
        type: 'daily_check',
        dailyCheckDate: dailyCheck.check_date,
        dailyCheckResponse: dailyCheck.response
    };
}

function mapDebtFromSupabase(debt) {
    return {
        ...debt,
        type: 'debt_snowball',
        __backendId: debt.id,
        debtName: debt.name,
        debtInitial: Number(debt.initial_amount) || 0,
        debtCurrent: Number(debt.current_balance) || 0,
        debtMinPayment: Number(debt.min_payment) || 0,
        debtPaymentDate: debt.payment_day,
        debtLiquidated: debt.is_liquidated
    };
}


function mapSavingsFromSupabase(savings) {
    return {
        ...savings,
        type: 'savings_goal',
        __backendId: savings.id,
        savingsGoal: Number(savings.target_amount) || 0,
        savingsCurrent: Number(savings.current_amount) || 0
    };
}



async function loadUserData() {
    try {
        // Obtener el usuario autenticado
        const { data: { session }, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) {
            throw new Error('No existe una sesión activa.');
        }

        const userId = session.user.id;

        // Consultar las seis tablas
        const [
            settingsResult,
            transactionsResult,
            budgetsResult,
            debtsResult,
            savingsResult,
            dailyChecksResult
        ] = await Promise.all([

            supabaseClient
                .from('user_settings')
                .select('*')
                .eq('user_id', userId),

            supabaseClient
                .from('transactions')
                .select('*')
                .eq('user_id', userId),

            supabaseClient
                .from('budgets')
                .select('*')
                .eq('user_id', userId),

            supabaseClient
                .from('debts')
                .select('*')
                .eq('user_id', userId),

            supabaseClient
                .from('savings_goals')
                .select('*')
                .eq('user_id', userId),

            supabaseClient
                .from('daily_checks')
                .select('*')
                .eq('user_id', userId)
        ]);

        // Comprobar errores de las consultas
        const results = [
            settingsResult,
            transactionsResult,
            budgetsResult,
            debtsResult,
            savingsResult,
            dailyChecksResult
        ];

        const failedQuery = results.find(result => result.error);

        if (failedQuery) throw failedQuery.error;

        // Adaptar los registros al formato de appData
        appData = [
            ...settingsResult.data.map(item => ({
                ...item,
                type: 'settings'
            })),

            ...transactionsResult.data.map(item =>
                mapTransactionFromSupabase(item)
            ),

            ...budgetsResult.data.map(item =>
                mapBudgetFromSupabase(item)
            ),

            ...debtsResult.data.map(item => mapDebtFromSupabase(item)),

            ...savingsResult.data.map(item =>
                mapSavingsFromSupabase(item)
            ),

            ...dailyChecksResult.data.map(item =>
                mapDailyCheckFromSupabase(item)
            )
        ];

        console.log('Datos recuperados desde Supabase:', appData);

        return true;

    } catch (error) {
        console.error('Error al recuperar los datos:', error);

        showToast(
            'No se pudieron recuperar tus datos financieros.',
            'error'
        );

        return false;
    }
}



async function initApp() {
    try {
        // 1. Comprobar sesión de Supabase
        const { data: { session }, error } =
            await supabaseClient.auth.getSession();

        if (error) throw error;

        // 2. Si no hay sesión, mostrar autenticación
        if (!session) {
            document.getElementById('auth-container').style.display = 'flex';
            document.getElementById('app-container').style.display = 'none';
            return;
        }

        // 3. Hay sesión: mostrar aplicación
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app').style.display = 'block';

        // 4. Inicializar personalización visual
        if (window.elementSdk) {
            window.elementSdk.init({
                defaultConfig,
                onConfigChange: async (config) => {
                    const titleEl = document.getElementById('app-title');
                    const subtitleEl = document.getElementById('app-subtitle');

                    if (titleEl) titleEl.textContent = config.app_title || defaultConfig.app_title;
                    if (subtitleEl) subtitleEl.textContent = config.app_subtitle || defaultConfig.app_subtitle;

                    document.body.style.backgroundColor = config.background_color || defaultConfig.background_color;
                    document.body.style.color = config.text_color || defaultConfig.text_color;

                    document.querySelectorAll('.gradient-primary').forEach(el => {
                        el.style.background = `linear-gradient(135deg, ${config.primary_color || defaultConfig.primary_color}, ${config.secondary_color || defaultConfig.secondary_color})`;
                    });

                    document.querySelectorAll('.gradient-text').forEach(el => {
                        el.style.backgroundImage = `linear-gradient(135deg, ${config.primary_color || defaultConfig.primary_color}, ${config.secondary_color || defaultConfig.secondary_color})`;
                    });
                },
                mapToCapabilities: (config) => ({
                    recolorables: [
                        { get: () => config.background_color || defaultConfig.background_color, set: (v) => window.elementSdk.setConfig({ background_color: v }) },
                        { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => window.elementSdk.setConfig({ surface_color: v }) },
                        { get: () => config.text_color || defaultConfig.text_color, set: (v) => window.elementSdk.setConfig({ text_color: v }) },
                        { get: () => config.primary_color || defaultConfig.primary_color, set: (v) => window.elementSdk.setConfig({ primary_color: v }) },
                        { get: () => config.secondary_color || defaultConfig.secondary_color, set: (v) => window.elementSdk.setConfig({ secondary_color: v }) }
                    ],
                    borderables: [],
                    fontEditable: undefined,
                    fontSizeable: undefined
                }),
                mapToEditPanelValues: (config) => new Map([
                    ['app_title', config.app_title || defaultConfig.app_title],
                    ['app_subtitle', config.app_subtitle || defaultConfig.app_subtitle]
                ])
            });
        }

        // 5. Aquí cargaremos los datos del usuario desde Supabase
        // Antes de ejecutar las funciones que dependen de appData.

        const loaded = await loadUserData();

        if (!loaded) return;

        loadCurrencyFromData();

        await checkMonthlyBudgetReset();

        updateUI();
        checkNotifications();
        checkDailyModal();

    } catch (error) {
        console.error('Error al iniciar la aplicación:', error);
        showToast('No se pudo iniciar la aplicación. Intenta recargar.', 'error');
    }
}



async function checkMonthlyBudgetReset() {
    const currentMonth = localMonthKey();

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('No existe una sesión activa.');

        // Consultar configuración existente
        const { data: settings, error: settingsError } =
            await supabaseClient
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

        if (settingsError) throw settingsError;

        let updatedSettings;

        if (!settings) {
            // Crear configuración únicamente si no existe
            const { data, error } = await supabaseClient
                .from('user_settings')
                .insert({
                    user_id: user.id,
                    currency: selectedCurrency || 'USD',
                    budget_reset_month: currentMonth
                })
                .select()
                .single();

            if (error) throw error;

            updatedSettings = data;

        } else if (settings.budget_reset_month !== currentMonth) {
            // Actualizar el mes de seguimiento
            const { data, error } = await supabaseClient
                .from('user_settings')
                .update({
                    budget_reset_month: currentMonth
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;

            updatedSettings = data;

        } else {
            // No hay cambios necesarios
            updatedSettings = settings;
        }

        // Sincronizar configuración local
        const settingsIndex = appData.findIndex(
            d => d.type === 'settings'
        );

        const mappedSettings = {
            ...updatedSettings,
            type: 'settings'
        };

        if (settingsIndex !== -1) {
            appData[settingsIndex] = mappedSettings;
        } else {
            appData.push(mappedSettings);
        }

    } catch (error) {
        console.error(
            'Error al actualizar el seguimiento mensual:',
            error
        );

        showToast(
            'No se pudo actualizar el seguimiento del presupuesto.',
            'error'
        );
    }
}




function loadCurrencyFromData() {
    const currencyRecord = appData.find(d => d.type === 'settings');

    if (currencyRecord) {
        selectedCurrency = currencyRecord.currency || 'USD';

        document.getElementById('currency-select').value = selectedCurrency;
    }
}



async function changeCurrency(currency) {
    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        // Guardar preferencia en Supabase
        const { error } = await supabase
            .from('user_settings')
            .upsert(
                {
                    user_id: user.id,
                    currency: currency
                },
                {
                    onConflict: 'user_id'
                }
            );

        if (error) throw error;

        // Actualizar moneda seleccionada localmente
        selectedCurrency = currency;

        // Actualizar interfaz
        updateUI();

    } catch (error) {
        console.error('Error actualizando moneda:', error);
        showToast('No se pudo actualizar la moneda', 'error');
    }
}


function formatCurrency(amount) {
    if (selectedCurrency === 'COP') {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
    } else if (selectedCurrency === 'PEN') {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(amount);
    } else if (selectedCurrency === 'ARS') {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
    } else if (selectedCurrency === 'CLP') {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);
    } else if (selectedCurrency === 'PYG') {
        return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 }).format(amount);
    } else if (selectedCurrency === 'UYU') {
        return new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(amount);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'gradient-primary' : type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function updateUI() {
    // Get current month only
    const now = new Date();
    const currentMonth = localMonthKey(now);

    const income = appData.filter(d => d.type === 'income' && d.date && localMonthKey(new Date(d.date)) === currentMonth).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const expenses = appData.filter(d => d.type === 'expense' && d.date && localMonthKey(new Date(d.date)) === currentMonth).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const available = income - expenses;

    const incomeEl = document.getElementById('total-income');
    const expensesEl = document.getElementById('total-expenses');
    const availableEl = document.getElementById('available-balance');

    if (incomeEl) incomeEl.textContent = formatCurrency(income);
    if (expensesEl) expensesEl.textContent = formatCurrency(expenses);
    if (availableEl) availableEl.textContent = formatCurrency(available);

    renderCurrentPage();
}

function navigateTo(page) {
    currentPage = page;
    registerMode = null;

    // Update nav buttons immediately
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isActive = btn.dataset.page === page;
        btn.classList.toggle('nav-active', isActive);
        const icon = btn.querySelector('svg');
        if (icon) icon.style.stroke = isActive ? '#B3428D' : '#6B7280';
    });

    renderCurrentPage();
}

function renderCurrentPage() {
    const main = document.getElementById('main-content');
    let html = '';

    switch (currentPage) {
        case 'home': html = renderHomePage(); break;
        case 'budget': html = renderBudgetPage(); break;
        case 'register': html = renderRegisterPage(); break;
        case 'goals': html = renderGoalsPage(); break;
    }

    main.innerHTML = html;

    // Render debt system after page loads if on goals
    if (currentPage === 'goals') {
        setTimeout(() => {
            if (currentPage === 'goals' && document.getElementById('active-debts-container')) {
                renderSnowballDebts();
            }
        }, 100);
    }

    // Defer Lucide icon rendering
    requestAnimationFrame(() => {
        if (window.lucide) lucide.createIcons();
    });
}

function renderHomePage() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayExpenses = appData.filter(d => {
        if (d.type !== 'expense' || !d.date) return false;
        const transDate = new Date(d.date);
        return transDate >= todayStart && transDate < todayEnd;
    });
    const todayTotal = todayExpenses.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Limit to 10 recent transactions for performance
    const recentTransactions = appData
        .filter(d => d.type === 'income' || d.type === 'expense')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    const budgetItems = appData.filter(d => d.type === 'budget');

    // Get all categories with recent activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const categoriesWithActivity = new Set();
    appData.filter(d => d.type === 'expense' && new Date(d.date) >= thirtyDaysAgo)
        .forEach(d => categoriesWithActivity.add(d.category));

    const sortedCategories = [...categoriesWithActivity, ...categories.filter(c => !categoriesWithActivity.has(c))].slice(0, 4);

    const topCategories = sortedCategories.map(cat => {
        const budget = budgetItems.find(b => b.category === cat);
        const spent = appData.filter(d => d.type === 'expense' && d.category === cat).reduce((sum, d) => sum + (d.amount || 0), 0);
        const total = budget?.budgetAmount || 0;
        const percent = total > 0 ? (spent / total) * 100 : 0;
        return { name: cat, spent, total, percent };
    });

    // Calculate category distribution (limit to 5)
    const currentMonthExpenses = localMonthKey();
    const allExpenses = appData.filter(d => d.type === 'expense' && d.date && d.date.substring(0, 7) === currentMonthExpenses);
    const totalExpenseAmount = allExpenses.reduce((sum, d) => sum + (d.amount || 0), 0);
    const categoryDistribution = {};

    allExpenses.forEach(d => {
        const cat = d.category || 'Otros';
        categoryDistribution[cat] = (categoryDistribution[cat] || 0) + (d.amount || 0);
    });

    const distributionArray = Object.entries(categoryDistribution)
        .map(([name, amount]) => ({ name, amount, percent: totalExpenseAmount > 0 ? (amount / totalExpenseAmount) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    // Generate pie chart with pre-calculated angles
    const chartColors = ['#D9BFE8', '#F3C7B5', '#C9B8E8', '#B9DDE1', '#BFE3D0'];
    let currentAngle = 0;
    const chartSegments = distributionArray.map((item, idx) => {
        const sliceAngle = (item.percent / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        const largeArc = sliceAngle > 180 ? 1 : 0;

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const x1 = 50 + 40 * Math.cos(startRad);
        const y1 = 50 + 40 * Math.sin(startRad);
        const x2 = 50 + 40 * Math.cos(endRad);
        const y2 = 50 + 40 * Math.sin(endRad);

        const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;
        currentAngle = endAngle;

        return `<path d="${pathData}" fill="${chartColors[idx % chartColors.length]}" stroke="white" stroke-width="2"/>`;
    }).join('');

    const pieChart = `<svg viewBox="0 0 100 100" class="w-full h-56 distribution-chart" role="img" aria-label="Distribución de gastos">${chartSegments}</svg>`;

    return `
        <div class="space-y-6">
          <div class="gradient-light rounded-2xl p-4 card-shadow">
            <p class="text-sm text-gray-600 mb-1">Gastos de hoy</p>
            <p class="text-2xl font-bold gradient-text">${formatCurrency(todayTotal)}</p>
          </div>

          ${(() => { const goal = appData.find(d => d.type === 'savings_goal'); const target = Math.max(Number(goal?.savingsGoal) || 0, 0); const current = Math.max(Number(goal?.savingsCurrent) || 0, 0); const pct = target > 0 ? Math.min(current / target * 100, 100) : 0; const circumference = Math.PI * 80; const dash = circumference * pct / 100; return `<div class="bg-white rounded-2xl p-5 card-shadow border border-green-100"><div class="flex items-center gap-4"><div class="relative w-28 h-20 shrink-0"><svg viewBox="0 0 100 55" class="w-full h-full" role="img" aria-label="${pct.toFixed(0)}% de ahorro completado"><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#E7F9EF" stroke-width="8" stroke-linecap="round"/><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#62C78A" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${circumference}"/></svg><span class="absolute inset-x-0 bottom-0 text-center text-lg font-bold text-green-700">${pct.toFixed(0)}%</span></div><div class="flex-1"><p class="text-xs uppercase tracking-wide text-gray-500">Meta de ahorro</p><p class="font-semibold text-gray-800">${formatCurrency(current)} <span class="text-gray-400 font-normal">de ${formatCurrency(target)}</span></p><p class="text-xs text-gray-500 mt-1">${target > 0 ? `Faltan ${formatCurrency(Math.max(target - current, 0))}` : 'Configura tu meta en Metas'}</p></div></div><button onclick="openQuickSavings()" class="w-full mt-4 py-3 rounded-xl pastel-income font-semibold btn-press">+ Ahorrar</button></div>`; })()}

          <div>
            <h3 class="font-semibold mb-3">Distribución de Gastos</h3>
            <div class="bg-white rounded-2xl p-6 card-shadow">
              ${totalExpenseAmount > 0 ? `
                <div class="flex gap-6">
                  <div class="flex-1 flex items-center justify-center">
                    ${pieChart}
                  </div>
                  <div class="flex-1 space-y-2">
                    ${distributionArray.map((item, idx) => `
                      <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background-color: ${chartColors[idx % chartColors.length]}"></div>
                        <span class="text-xs text-gray-600 flex-1">${item.name}</span>
                        <span class="text-xs font-semibold text-gray-700">${item.percent.toFixed(0)}%</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : '<p class="text-gray-500 text-center py-4">Sin gastos registrados</p>'}
            </div>
          </div>

          ${renderDebtProgressArc()}
          <div class="glass-surface rounded-2xl p-5 card-shadow border border-white/70">
            <div class="flex items-center gap-3"><div class="w-11 h-11 rounded-2xl gradient-light flex items-center justify-center text-xl">🎯</div><div><h3 class="font-semibold">Siguiente deuda recomendada</h3><p class="text-sm text-gray-600">${getActiveDebts().length ? `Enfócate en <strong>${getActiveDebts()[0].debtName}</strong>, la deuda con menor saldo (${formatCurrency(getActiveDebts()[0].debtCurrent || 0)}). Mantén las cuotas mínimas y dirige cualquier extra hacia ella.` : 'Registra tus deudas para recibir una recomendación de bola de nieve.'}</p></div></div>
          </div>
          <div class="glass-surface rounded-2xl p-5 card-shadow border border-white/70">
            <div class="flex items-center gap-3"><div class="w-11 h-11 rounded-2xl pastel-income flex items-center justify-center text-xl">🌱</div><div><h3 class="font-semibold">Reconocimiento a tu constancia</h3><p class="text-sm text-gray-600">Cada aporte a tu ahorro es una decisión a favor de tu tranquilidad. ¡Sigue avanzando hacia tu meta!</p></div></div>
          </div>

          ${(() => { const budgets = appData.filter(d => d.type === 'budget' && (Number(d.budgetAmount) || 0) > 0); const activeDebts = appData.filter(d => d.type === 'debt_snowball' && !d.debtLiquidated); const spent = budgets.reduce((s, b) => s + getBudgetCycleStatus(b.category, Number(b.budgetAmount) || 0).spent, 0); const currentMonth = localMonthKey(); const debtPaymentsSpent = appData.filter(p => p.type === 'expense' && p.debtPaymentId && p.date && localMonthKey(new Date(p.date)) === currentMonth).reduce((s, p) => s + (Number(p.amount) || 0), 0); const debtPayments = activeDebts.reduce((s, d) => s + (Number(d.debtMinPayment) || 0), 0); const total = budgets.reduce((s, b) => s + (Number(b.budgetAmount) || 0), 0) + debtPayments; const percent = total ? ((spent + debtPaymentsSpent) / total) * 100 : 0; const exceeded = percent > 100; return total > 0 ? `<div class="glass-surface rounded-2xl p-4 card-shadow border ${exceeded ? 'border-red-200 bg-red-50/50' : 'border-purple-100'}"><div class="flex justify-between items-center mb-2"><div><h3 class="font-semibold text-sm">${exceeded ? '⚠️ Presupuesto excedido' : '📊 Avance del presupuesto'}</h3><p class="text-xs text-gray-500">${exceeded ? 'Revisa tus gastos para recuperar el control.' : 'Te acercas al límite mensual.'}</p></div><span class="text-sm font-bold ${exceeded ? 'text-red-600' : 'text-purple-600'}">${percent.toFixed(0)}%</span></div><div class="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${exceeded ? 'bg-red-400' : 'progress-gradient'}" style="width:${Math.min(percent, 100)}%"></div></div><p class="text-xs text-gray-500 mt-2">${formatCurrency(spent + debtPaymentsSpent)} de ${formatCurrency(total)}${exceeded ? ` · Exceso: ${formatCurrency((spent + debtPaymentsSpent) - total)}` : ''}</p></div>` : ''; })()}

          <div>
            <h3 class="font-semibold mb-3">Últimos Movimientos</h3>
            <div class="space-y-2">
              ${recentTransactions.length === 0 ? '<p class="text-gray-500 text-center py-4">Sin movimientos aún</p>' :
            recentTransactions.map(t => `
                  <div class="flex items-center justify-between bg-gray-50 rounded-xl p-3 group hover:bg-gray-100 transition-colors">
                    <div class="flex items-center gap-3 flex-1">
                      <div class="${t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold">
                        ${t.type === 'income' ? '↓' : '↑'}
                      </div>
                      <div>
                        <p class="font-medium text-sm">${t.category || (t.type === 'income' ? 'Ingreso' : 'Gasto')}</p>
                        <p class="text-xs text-gray-500">${new Date(t.date).toLocaleDateString('es')}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="${t.type === 'income' ? 'text-green-600' : 'text-red-600'} font-semibold text-sm">
                        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                      </span>
                      <button onclick="deleteTransaction('${t.__backendId}')" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-all p-1">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>
      `;
}

function getBudgetCycleStatus(category, budgetAmount) {
    if (!budgetAmount || budgetAmount <= 0) return { spent: 0, remaining: 0, completed: false };
    const currentMonth = localMonthKey();
    const spent = appData
        .filter(d => d.type === 'expense' && d.category === category && d.date && localMonthKey(new Date(d.date)) === currentMonth)
        .reduce((sum, expense) => sum + Math.max(Number(expense.amount) || 0, 0), 0);
    return {
        spent,
        remaining: Math.max(budgetAmount - spent, 0),
        completed: spent >= budgetAmount
    };
}

function renderBudgetPage() {
    const budgetItems = appData.filter(d => d.type === 'budget');
    const debtItems = appData.filter(d => d.type === 'debt_snowball' && !d.debtLiquidated);
    const debtPayments = debtItems.reduce((sum, d) => sum + (d.debtMinPayment || 0), 0);
    const totalBudget = budgetItems.reduce((sum, b) => sum + (b.budgetAmount || 0), 0) + debtPayments;
    const currentMonth = localMonthKey();

    return `
        <div class="space-y-4">
          <div class="gradient-primary rounded-2xl p-4 text-white">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm opacity-90">Presupuesto Total Mensual</p>
                <p class="text-2xl font-bold mt-1">${formatCurrency(totalBudget)}</p>
              </div>
              <button onclick="editBudgetCategory('')" class="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-sm font-semibold btn-press">+ Tarjeta</button>
            </div>
          </div>

          <div class="space-y-3">
            ${budgetItems.map(b => b.category).filter(Boolean).sort((a, b) => {
        const da = budgetItems.find(x => x.category === a)?.paymentDate || 32;
        const db = budgetItems.find(x => x.category === b)?.paymentDate || 32;
        return da - db || a.localeCompare(b);
    }).map(cat => {
        const budget = budgetItems.find(b => b.category === cat);
        const total = budget?.budgetAmount || 0;
        const budgetStatus = getBudgetCycleStatus(cat, total);
        const spent = budgetStatus.spent;
        const percent = total > 0 ? (spent / total) * 100 : 0;
        const isFixed = budget?.isFixed || false;
        const payDate = budget?.paymentDate || 1;

        let statusColor = 'text-gray-500';
        let statusMessage = '📋 Sin presupuesto';
        let cardBorder = 'border-gray-200';

        if (total > 0) {
            if (percent > 100) {
                statusColor = 'text-red-600';
                statusMessage = '❌ Estás excediendo el presupuesto';
                cardBorder = 'border-red-200 bg-red-50';
            } else if (percent === 100) {
                statusColor = 'text-green-600';
                statusMessage = '✅ ¡Presupuesto cumplido!';
                cardBorder = 'border-green-200 bg-green-50';
            } else if (percent >= 80) {
                statusColor = 'text-yellow-600';
                statusMessage = '⏳ Aún falta para cumplir el pago';
                cardBorder = 'border-yellow-200 bg-yellow-50';
            } else {
                statusColor = 'text-blue-600';
                statusMessage = '💾 En control';
                cardBorder = 'border-blue-200 bg-blue-50';
            }
        }

        return `
                <div class="bg-white rounded-2xl p-4 card-shadow border-2 ${cardBorder}">
                  <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                      <h4 class="font-semibold text-sm">${cat}</h4>
                      ${isFixed ? '<span class="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Fijo - Día ' + payDate + '</span>' : ''}
                    </div>
                    <div class="flex items-center gap-1">
                      <button onclick="editBudgetCategory('${cat}')" class="text-gray-400 hover:text-gray-600 p-1" aria-label="Editar tarjeta">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      ${budget ? `<button onclick="deleteBudgetCategory('${budget.__backendId}')" class="text-gray-400 hover:text-red-600 p-1" aria-label="Eliminar tarjeta"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                    </div>
                  </div>
                  <div class="flex justify-between text-sm mb-2">
                    <span class="text-gray-500">Gastado</span>
                    <span class="font-medium">${formatCurrency(spent)} / ${formatCurrency(total)}</span>
                  </div>
                  <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full progress-gradient rounded-full transition-all" style="width: ${total > 0 ? Math.min(percent, 100) : 0}%"></div>
                  </div>
                  <p class="${statusColor} text-xs mt-2">${statusMessage}</p>
                </div>
              `;
    }).join('')}
          </div>

          <!-- Deudas con Pago Mensual -->
          ${(() => {
            const debtItems = appData.filter(d => d.type === 'debt_snowball' && !d.debtLiquidated);
            if (debtItems.length === 0) return '';

            return `
              <div class="mt-6 pt-6 border-t border-gray-200">
                <h3 class="font-semibold text-sm mb-3">💳 Cuotas Mensuales de Deudas</h3>
                <div class="space-y-3">
                  ${debtItems.map(debt => {
                const currentMonth = localMonthKey();
                const paidThisMonth = appData.filter(p => p.type === 'expense' && p.debtPaymentId === debt.__backendId && p.date && p.date.substring(0, 7) === currentMonth).reduce((sum, p) => sum + (p.amount || 0), 0);
                const monthlyPayment = Math.max((debt.debtMinPayment || 0) - paidThisMonth, 0);
                return `
                      <div class="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-4 card-shadow border-2 border-orange-200">
                        <div class="flex justify-between items-start mb-2">
                          <div>
                            <h4 class="font-semibold text-sm">${debt.debtName}</h4>
                            <span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Día ${debt.debtPaymentDate || 15}</span>
                          </div>
                          <button onclick="editDebtSnowball('${debt.__backendId}')" class="text-gray-400 hover:text-gray-600 p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                          </button>
                        </div>
                        <div class="flex justify-between text-sm">
                          <span class="text-gray-600">Cuota mensual</span>
                          <span class="font-bold text-red-600">${formatCurrency(monthlyPayment)}</span>
                        </div>
                        <div class="text-xs text-gray-500 mt-1">Saldo: ${formatCurrency(debt.debtCurrent || 0)}</div>
                      </div>
                    `;
            }).join('')}
                </div>
              </div>
            `;
        })()}
        </div>

        <div id="budget-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full card-shadow">
            <h3 id="modal-category-title" class="text-lg font-semibold mb-4">Editar Categoría</h3>
            <div class="space-y-4">
              <div>
                <label for="modal-category-name" class="text-sm text-gray-600 block mb-1">Concepto de la tarjeta</label>
                <input type="hidden" id="modal-original-category" value="">
                <input type="text" id="modal-category-name" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="Ej: Alquiler, colegio, tarjeta..."><p class="text-xs text-gray-500 mt-1">Puedes crear un concepto nuevo o modificar el actual.</p>
              </div>
              <div>
                <label for="modal-budget-amount" class="text-sm text-gray-600 block mb-1">Monto Mensual</label>
                <input type="number" id="modal-budget-amount" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="0">
              </div>
              <div class="flex items-center gap-3">
                <input type="checkbox" id="modal-is-fixed" class="w-5 h-5 rounded accent-purple-600">
                <label for="modal-is-fixed" class="text-sm">Es gasto fijo</label>
              </div>
              <div id="payment-date-container">
                <label for="modal-payment-date" class="text-sm text-gray-600 block mb-1">Día obligatorio de pago</label>
                <select id="modal-payment-date" required class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none bg-white">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">Día ${i + 1}</option>`).join('')}</select>
                <p class="text-xs text-gray-500 mt-1">Las tarjetas se ordenarán por la fecha más próxima.</p>
              </div>
              <div id="other-description-container" class="hidden">
                <label class="text-sm text-gray-600 block mb-1">Descripción (para Otros)</label>
                <input type="text" id="modal-other-description" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="Ej: Reparaciones, hobbies, etc.">
              </div>
            </div>
            <div class="flex gap-3 mt-6">
              <button onclick="closeBudgetModal()" class="flex-1 py-3 rounded-xl border-2 border-gray-200 font-medium btn-press">Cancelar</button>
              <button onclick="saveBudgetCategory()" class="flex-1 py-3 rounded-xl gradient-primary text-white font-medium btn-press">Guardar</button>
            </div>
          </div>
        </div>
      `;
}

function editBudgetCategory(category) {
    const budget = appData.find(d => d.type === 'budget' && d.category === category);
    document.getElementById('modal-category-name').value = category || '';
    document.getElementById('modal-original-category').value = category || '';
    document.getElementById('modal-category-title').textContent = budget ? 'Editar tarjeta' : 'Nueva tarjeta de presupuesto';
    document.getElementById('modal-budget-amount').value = budget?.budgetAmount || '';
    document.getElementById('modal-is-fixed').checked = budget?.isFixed || false;
    document.getElementById('modal-payment-date').value = budget?.paymentDate || '';
    document.getElementById('modal-other-description').value = budget?.otherDescription || '';
    document.getElementById('other-description-container').classList.toggle('hidden', category !== 'Otros');
    document.getElementById('budget-modal').classList.remove('hidden');
    document.getElementById('budget-modal').classList.add('flex');
}

function closeBudgetModal() {
    document.getElementById('budget-modal').classList.add('hidden');
    document.getElementById('budget-modal').classList.remove('flex');
}


async function deleteBudgetCategory(id) {
    const budget = appData.find(
        d => d.__backendId === id
    );

    if (!budget) return;

    try {
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        const { error } = await supabase
            .from('budgets')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw error;

        // Actualizar datos locales
        appData = appData.filter(
            d => d.__backendId !== id
        );

        showToast('Tarjeta eliminada y función desactivada');

    } catch (error) {
        console.error('Error eliminando tarjeta:', error);
        showToast('No se pudo eliminar la tarjeta', 'error');
    }
}



async function saveBudgetCategory() {
    const category = document.getElementById('modal-category-name').value.trim();
    const amount = parseFloat(document.getElementById('modal-budget-amount').value) || 0;
    const isFixed = document.getElementById('modal-is-fixed').checked;
    const paymentDateValue = document.getElementById('modal-payment-date').value;
    const paymentDate = parseInt(paymentDateValue, 10);

    if (!category) {
        showToast('Escribe un concepto para la tarjeta', 'warning');
        return;
    }

    if (!paymentDateValue || paymentDate < 1 || paymentDate > 31) {
        showToast('La fecha de pago es obligatoria (día 1 a 31)', 'warning');
        return;
    }

    const otherDescription =
        document.getElementById('modal-other-description').value || '';

    const originalCategory =
        document.getElementById('modal-original-category').value || category;

    const existing = appData.find(
        d => d.type === 'budget' && d.category === originalCategory
    );

    try {
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('No existe una sesión activa.');

        let result;

        if (existing) {
            // Actualizar presupuesto existente
            const { data, error } = await supabaseClient
                .from('budgets')
                .update({
                    category,
                    budget_amount: amount,
                    is_fixed: isFixed,
                    payment_day: paymentDate,
                    other_description: otherDescription
                })
                .eq('id', existing.id)
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;

            result = data;

            // Actualizar appData
            const index = appData.findIndex(d => d.id === existing.id);

            appData[index] = mapBudgetFromSupabase(result);

        } else {
            // Crear nuevo presupuesto
            const { data, error } = await supabaseClient
                .from('budgets')
                .insert({
                    user_id: user.id,
                    category,
                    budget_amount: amount,
                    is_fixed: isFixed,
                    payment_day: paymentDate,
                    other_description: otherDescription
                })
                .select()
                .single();

            if (error) throw error;

            result = data;

            // Agregar a appData
            appData.push(mapBudgetFromSupabase(result));
        }

        closeBudgetModal();
        updateUI();
        showToast('Presupuesto actualizado');

    } catch (error) {
        console.error('Error al guardar el presupuesto:', error);
        showToast('No se pudo guardar la tarjeta. Intenta nuevamente.', 'error');
    }
}


let quickAmount = '';
let quickIntent = 'necessary';
let quickType = 'expense';
const incomeSources = ['💼 Sueldo/Nómina', '📈 Negocio/Ventas', '💵 Honorarios/Extra', '🎁 Regalo', '✨ Otros'];

function setQuickType(type) {
    quickType = type;
    const expense = document.getElementById('quick-expense-tab');
    const income = document.getElementById('quick-income-tab');
    const debt = document.getElementById('quick-debt-tab');
    const title = document.getElementById('quick-title');
    const intent = document.getElementById('quick-intent-wrap');
    [expense, income, debt].forEach(btn => { if (btn) btn.classList.add('opacity-60'); });
    const active = type === 'expense' ? expense : type === 'income' ? income : debt;
    if (active) active.classList.remove('opacity-60');
    if (title) title.textContent = type === 'income' ? '¿Cuánto recibiste?' : type === 'debt' ? '¿Cuánto pagarás?' : '¿Cuánto gastaste?';
    if (intent) intent.classList.toggle('hidden', type !== 'expense');
    renderQuickCategories();
}

function openQuickRegister() {
    quickAmount = '';
    quickIntent = 'necessary';
    quickType = 'expense';
    const sheet = document.getElementById('quick-register-sheet');
    sheet.classList.remove('hidden'); sheet.classList.add('flex');
    renderQuickCategories(); updateQuickIntent(); updateQuickAmount();
}

function closeQuickRegister(event) {
    if (event && event.target !== event.currentTarget) return;
    const sheet = document.getElementById('quick-register-sheet');
    sheet.classList.add('hidden'); sheet.classList.remove('flex');
}

function quickKey(key) {
    if (key === '⌫') quickAmount = quickAmount.slice(0, -1);
    else if (key === '.' && quickAmount.includes('.')) return;
    else if (quickAmount.length < 12) quickAmount += key;
    updateQuickAmount();
}

function updateQuickAmount() { const el = document.getElementById('quick-amount'); if (el) el.textContent = quickAmount || '0'; }
function setQuickIntent(intent) { quickIntent = intent; updateQuickIntent(); }
function updateQuickIntent() {
    const needed = document.getElementById('quick-needed'), impulse = document.getElementById('quick-impulse');
    if (!needed || !impulse) return;
    needed.className = quickIntent === 'necessary' ? 'flex-1 py-2 rounded-xl border-2 border-purple-300 bg-purple-50 text-sm font-semibold' : 'flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600';
    impulse.className = quickIntent === 'impulse' ? 'flex-1 py-2 rounded-xl border-2 border-purple-300 bg-purple-50 text-sm font-semibold' : 'flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600';
}
function renderQuickCategories() {
    const target = document.getElementById('quick-categories');
    const selector = document.getElementById('quick-debt-selector');
    if (!target || !selector) return;
    const active = appData.filter(d => d.type === 'budget' && d.category).map(d => d.category);
    if (quickType === 'debt') {
        const debts = getActiveDebts();
        selector.classList.remove('hidden');
        selector.innerHTML = debts.length ? `<label for="quick-debt-select" class="sr-only">Selecciona una deuda</label><select id="quick-debt-select" onchange="updateQuickDebtAmount()" class="w-full px-4 py-3 rounded-xl border border-orange-200 bg-white text-sm"><option value="">Selecciona la deuda a pagar...</option>${debts.map(d => { const pending = getDebtPendingPayment(d); return `<option value="${d.__backendId}" data-pending="${pending}" ${pending <= 0 ? 'disabled' : ''}>${d.debtName} · Cuota ${pending > 0 ? formatCurrency(pending) + ' pendiente' : 'en $0'}</option>`; }).join('')}</select>` : '<p class="text-sm text-gray-500 text-center w-full py-2">No hay deudas activas. Agrégalas desde Metas.</p>';
        target.innerHTML = `<button onclick="saveQuickDebtPayment()" disabled class="w-full px-3 py-3 rounded-xl pastel-debt text-sm font-semibold opacity-50">Deudas · Guardar pago</button>`;
        return;
    }
    selector.classList.add('hidden');
    selector.innerHTML = '';
    const cats = quickType === 'income' ? incomeSources : [...new Set(active.length ? active : categories.slice(0, 5))];
    target.innerHTML = cats.map(cat => `<button onclick="saveQuickExpense('${cat.replace(/'/g, "\\'")}')" class="whitespace-nowrap px-3 py-2 rounded-xl ${quickType === 'income' ? 'pastel-chip-income' : 'pastel-chip'} text-xs font-semibold">${cat}</button>`).join('');
}
function getDebtPendingPayment(debt) {
    if (!debt) return 0;
    const month = localMonthKey();
    const paidThisMonth = appData.filter(p => p.type === 'expense' && p.debtPaymentId === debt.__backendId && p.date && p.date.substring(0, 7) === month).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.min(Math.max((Number(debt.debtMinPayment) || 0) - paidThisMonth, 0), Math.max(Number(debt.debtCurrent) || 0, 0));
}

function updateQuickDebtAmount() {
    const select = document.getElementById('quick-debt-select');
    const debt = appData.find(d => d.__backendId === select?.value);
    const pending = getDebtPendingPayment(debt);
    quickAmount = pending > 0 ? String(pending) : '';
    updateQuickAmount();
    const saveButton = document.querySelector('#quick-categories button[onclick="saveQuickDebtPayment()"]');
    if (saveButton) {
        saveButton.disabled = !debt || pending <= 0;
        saveButton.classList.toggle('opacity-50', saveButton.disabled);
    }
}
function saveQuickDebt() { setQuickType('debt'); }

async function saveQuickExpense(category) {
    // Si es un pago de deuda, utilizar su función específica
    if (quickType === 'debt') return saveQuickDebtPayment();

    const amount = parseFloat(quickAmount);

    if (!amount || amount <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }

    if (appData.length >= 999) {
        showToast('Límite de registros alcanzado', 'error');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('No existe una sesión activa.');

        // Insertar transacción en Supabase
        const { data, error } = await supabaseClient
            .from('transactions')
            .insert({
                user_id: user.id,
                type: quickType,
                category,
                amount,
                method: 'General',
                transaction_date: new Date().toISOString(),
                is_partial: false,
                impulsive_spend: quickType === 'expense' && quickIntent === 'impulse'
            })
            .select()
            .single();

        if (error) throw error;

        // Actualizar estado local
        appData.push(mapTransactionFromSupabase(data));

        closeQuickRegister();

        showToast(
            `${quickType === 'income' ? 'Ingreso' : 'Gasto'} registrado ✓`
        );

        renderCurrentPage();

    } catch (error) {
        console.error('Error al registrar la transacción:', error);

        showToast(
            `No se pudo registrar el ${quickType === 'income' ? 'ingreso' : 'gasto'}. Intenta nuevamente.`,
            'error'
        );
    }
}



async function saveQuickDebtPayment() {

    const select = document.getElementById('quick-debt-select');
    const debtId = String(select?.value || '').trim();

    console.log('ID seleccionado:', debtId);

    console.log('Deudas disponibles:', appData.filter(
        d => d.__backendId || d.type === 'debt'
    ));

    const debt = appData.find(d =>
        String(d.__backendId || d.id || '') === debtId
    );

    console.log('Deuda encontrada:', debt);

    const amount = parseFloat(quickAmount) || 0;

    if (!debt) {
        showToast('Selecciona una deuda', 'warning');
        return;
    }

    const pending = getDebtPendingPayment(debt);

    if (pending <= 0) {
        showToast('Esta deuda no tiene cuota pendiente este mes', 'warning');
        return;
    }

    if (amount <= 0 || amount > (debt.debtCurrent || 0)) {
        showToast('Ingresa un monto válido para la deuda', 'warning');
        return;
    }

    if (appData.length >= 999) {
        showToast('Límite de registros alcanzado', 'error');
        return;
    }

    try {
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('No existe una sesión activa.');

        // 1. Registrar el pago como una transacción
        const { data: transaction, error: transactionError } =
            await supabaseClient
                .from('transactions')
                .insert({
                    user_id: user.id,
                    type: 'expense',
                    category: 'Deudas',
                    amount: amount,
                    method: 'Pago de deuda',
                    transaction_date: new Date().toISOString(),
                    is_partial: false,
                    impulsive_spend: false,
                    debt_id: debt.id
                })
                .select()
                .single();

        if (transactionError) throw transactionError;

        appData.push(mapTransactionFromSupabase(transaction));

        // 2. Calcular el nuevo saldo de la deuda
        const newBalance = Math.max(
            (Number(debt.debtCurrent) || 0) - amount,
            0
        );

        const isLiquidated = newBalance <= 0;

        // 3. Actualizar la deuda en Supabase
        const { data: updatedDebt, error: debtError } =
            await supabaseClient
                .from('debts')
                .update({
                    current_balance: newBalance,
                    is_liquidated: isLiquidated
                })
                .eq('id', debt.id)
                .eq('user_id', user.id)
                .select()
                .single();

        if (debtError) {
            console.error('Error al actualizar la deuda:', debtError);
            showToast(
                'El pago se guardó, pero no se pudo actualizar la deuda',
                'error'
            );
            return;
        }

        // 4. Actualizar también el estado local de la aplicación
        const debtIndex = appData.findIndex(d =>
            d.type === 'debt' && d.id === debt.id
        );

        if (debtIndex !== -1) {
            appData[debtIndex] = mapDebtFromSupabase(updatedDebt);
        }

        closeQuickRegister();
        showToast('Pago de deuda registrado ✓');
        renderCurrentPage();

    } catch (error) {
        console.error('Error al registrar el pago de deuda:', error);
        showToast('No se pudo registrar el pago', 'error');
    }
}


function renderRegisterPage() {
    if (registerMode === 'income') return renderIncomeForm();
    if (registerMode === 'expense') return renderExpenseForm();
    if (registerMode === 'debt') return renderDebtRegisterPage();

    return `
        <div class="space-y-4">
          <h2 class="text-xl font-bold gradient-text text-center mb-6">Registrar Movimiento</h2>
          
          <button onclick="setRegisterMode('income')" class="w-full p-6 gradient-light rounded-2xl card-shadow flex items-center gap-4 btn-press border-2 border-transparent hover:border-green-300 transition-all">
            <div class="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </div>
            <div class="text-left">
              <p class="text-lg font-semibold text-green-700">+ Ingreso</p>
              <p class="text-sm text-gray-500">Registrar dinero recibido</p>
            </div>
          </button>

          <button onclick="setRegisterMode('expense')" class="w-full p-6 gradient-light rounded-2xl card-shadow flex items-center gap-4 btn-press border-2 border-transparent hover:border-red-300 transition-all">
            <div class="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center"><svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg></div>
            <div class="text-left"><p class="text-lg font-semibold text-red-700">- Gasto</p><p class="text-sm text-gray-500">Registrar pago o compra</p></div>
          </button>
          <button onclick="setRegisterMode('debt')" class="w-full p-6 pastel-debt rounded-2xl card-shadow flex items-center gap-4 btn-press border-2 border-transparent hover:border-orange-300 transition-all">
            <div class="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-2xl">💳</div>
            <div class="text-left"><p class="text-lg font-semibold text-orange-700">Deudas</p><p class="text-sm text-gray-500">Ver y pagar cuotas del mes</p></div>
          </button>
        </div>
      `;
}

function setRegisterMode(mode) {
    registerMode = mode;
    renderCurrentPage();
}

function renderDebtRegisterPage() {
    const debts = getActiveDebts();
    const month = localMonthKey();
    return `<div class="space-y-4">
        <button onclick="setRegisterMode(null)" class="flex items-center gap-2 text-gray-600 mb-2">← Volver</button>
        <h2 class="text-xl font-bold gradient-text">Registrar pago de deuda</h2>
        ${debts.length ? `
          <div class="bg-white rounded-2xl p-4 card-shadow border border-orange-100">
            <label for="register-debt-select" class="text-sm text-gray-600 block mb-2">Selecciona una deuda</label>
            <select id="register-debt-select" onchange="updateDebtRegisterAmount()" class="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white">
              <option value="">Elegir deuda...</option>
              ${debts.map(d => {
        const paid = appData.filter(p => p.type === 'expense' && p.debtPaymentId === d.__backendId && p.date && p.date.substring(0, 7) === month).reduce((s, p) => s + (p.amount || 0), 0);
        const pending = Math.min(Math.max((d.debtMinPayment || 0) - paid, 0), d.debtCurrent || 0);
        return `<option value="${d.__backendId}" data-pending="${pending}" data-balance="${d.debtCurrent || 0}">${d.debtName} · Saldo ${formatCurrency(d.debtCurrent || 0)} · Cuota ${formatCurrency(pending)}</option>`;
    }).join('')}
            </select>
            <div id="debt-register-summary" class="mt-3 text-sm text-gray-500">Elige una deuda para ver su saldo y cuota pendiente.</div>
            <label for="register-debt-amount" class="text-sm text-gray-600 block mt-4 mb-2">Valor del pago</label>
            <input type="number" id="register-debt-amount" class="w-full px-4 py-3 text-xl border border-gray-200 rounded-xl" placeholder="0" min="0" step="0.01">
            <button onclick="saveDebtRegisterPayment()" class="w-full mt-4 py-3 rounded-xl gradient-primary text-white font-semibold btn-press">Registrar pago como gasto</button>
          </div>` : '<p class="text-gray-500 text-center py-6">No hay deudas activas. Agrégalas desde Metas.</p>'}
      </div>`;
}

function updateDebtRegisterAmount() {
    const select = document.getElementById('register-debt-select');
    const option = select?.options[select.selectedIndex];
    const amount = parseFloat(option?.dataset.pending || 0);
    const balance = parseFloat(option?.dataset.balance || 0);
    const input = document.getElementById('register-debt-amount');
    const summary = document.getElementById('debt-register-summary');
    if (input) input.value = amount > 0 ? amount : '';
    if (summary) summary.textContent = option?.value ? `Saldo actual: ${formatCurrency(balance)} · Cuota pendiente del mes: ${formatCurrency(amount)}. Puedes editar el valor.` : 'Elige una deuda para ver su saldo y cuota pendiente.';
}


async function saveDebtRegisterPayment() {
    const select = document.getElementById('register-debt-select');
    const id = select?.value;

    const amount = parseFloat(
        document.getElementById('register-debt-amount')?.value
    ) || 0;

    // Buscar la deuda en los datos cargados
    const debt = appData.find(
        d => (d.id || d.__backendId) === id
    );

    if (!debt) {
        showToast('Selecciona una deuda', 'warning');
        return;
    }

    if (amount <= 0) {
        showToast('Ingresa un valor válido', 'warning');
        return;
    }

    const currentBalance = Number(debt.debtCurrent) || 0;

    if (amount > currentBalance) {
        showToast('El pago no puede superar el saldo de la deuda', 'warning');
        return;
    }

    if (appData.length >= 999) {
        showToast('Límite de registros alcanzado', 'error');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        // Registrar el pago como una transacción
        const { data: payment, error: paymentError } =
            await supabaseClient
                .from('transactions')
                .insert({
                    user_id: user.id,
                    type: 'expense',
                    category: 'Deudas',
                    amount: amount,
                    method: 'Pago de deuda',
                    transaction_date: new Date().toISOString(),
                    is_partial: false,
                    impulsive_spend: false,
                    debt_id: debt.id
                })
                .select()
                .single();

        if (paymentError) {
            console.error('Error registrando pago:', paymentError);
            showToast('No se pudo registrar el pago', 'error');
            return;
        }

        // Calcular nuevo saldo
        const newBalance = Math.max(currentBalance - amount, 0);
        const isLiquidated = newBalance <= 0;

        // Actualizar deuda en Supabase
        const { data: updatedDebt, error: debtError } =
            await supabaseClient
                .from('debts')
                .update({
                    current_balance: newBalance,
                    is_liquidated: isLiquidated
                })
                .eq('id', debt.id)
                .eq('user_id', user.id)
                .select()
                .single();

        if (debtError) {
            console.error('Error actualizando deuda:', debtError);
            showToast(
                'El gasto se guardó, pero no se pudo actualizar la deuda',
                'error'
            );
            return;
        }

        // Actualizar datos locales
        const mappedPayment = mapTransactionFromSupabase(payment);
        const mappedDebt = mapDebtFromSupabase(updatedDebt);

        appData = appData.map(d =>
            (d.id || d.__backendId) === debt.id
                ? mappedDebt
                : d
        );

        appData.push(mappedPayment);

        showToast('Pago registrado y saldo actualizado ✓');

        registerMode = null;
        renderCurrentPage();

    } catch (error) {
        console.error('Error registrando pago de deuda:', error);
        showToast('Ocurrió un error al registrar el pago', 'error');
    }
}


function renderIncomeForm() {
    return `
        <div class="space-y-4">
          <button onclick="setRegisterMode(null)" class="flex items-center gap-2 text-gray-600 mb-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            Volver
          </button>
          
          <h2 class="text-xl font-bold text-green-700">Registrar Ingreso</h2>
          
          <div>
            <label class="text-sm text-gray-600 block mb-2">Monto</label>
            <input type="number" id="income-amount" class="w-full px-4 py-4 text-xl border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-300 outline-none" placeholder="0">
          </div>

          <button onclick="saveIncome()" class="w-full py-4 gradient-primary text-white rounded-xl font-semibold text-lg btn-press mt-6">
            Guardar Ingreso
          </button>
        </div>
      `;
}


async function saveIncome() {
    const amount = parseFloat(
        document.getElementById('income-amount')?.value
    ) || 0;

    if (amount <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }

    if (appData.length >= 999) {
        showToast('Límite de registros alcanzado', 'error');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        // Registrar ingreso en Supabase
        const { data: result, error } = await supabaseClient
            .from('transactions')
            .insert({
                user_id: user.id,
                type: 'income',
                category: 'Ingreso',
                amount: amount,
                method: '',
                transaction_date: new Date().toISOString(),
                is_partial: false,
                impulsive_spend: false
            })
            .select()
            .single();

        if (error) {
            console.error('Error registrando ingreso:', error);
            showToast(
                'No se pudo registrar el ingreso. Intenta nuevamente.',
                'error'
            );
            return;
        }

        // Actualizar datos locales
        const mappedIncome = mapTransactionFromSupabase(result);
        appData.push(mappedIncome);

        showToast('Ingreso registrado ✓');

        // Calcular dinero disponible
        const income = appData
            .filter(d => d.type === 'income')
            .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        const expenses = appData
            .filter(d => d.type === 'expense')
            .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        showToast(
            `Disponible: ${formatCurrency(income - expenses)}`,
            'success'
        );

        registerMode = null;
        renderCurrentPage();

    } catch (error) {
        console.error('Error inesperado registrando ingreso:', error);
        showToast(
            'Ocurrió un error al registrar el ingreso.',
            'error'
        );
    }
}


function renderExpenseForm() {
    const budgetItems = appData.filter(d => d.type === 'budget');
    const debtItems = appData.filter(d => d.type === 'debt_snowball' && !d.debtLiquidated);

    return `
        <div class="space-y-4">
          <button onclick="setRegisterMode(null)" class="flex items-center gap-2 text-gray-600 mb-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            Volver
          </button>
          
          <h2 class="text-xl font-bold text-red-700">Registrar Gasto</h2>
          
          <div>
            <label class="text-sm text-gray-600 block mb-2">Categoría</label>
            <select id="expense-category" onchange="onCategoryChange()" class="w-full px-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-300 outline-none bg-white">
              <option value="">Seleccionar categoría</option>
              ${categories.map(cat => {
        const budget = budgetItems.find(b => b.category === cat);
        const budgetAmt = budget?.budgetAmount || 0;
        const budgetStatus = getBudgetCycleStatus(cat, budgetAmt);
        const spent = budgetStatus.spent;
        const remaining = budgetStatus.remaining;
        return `<option value="${cat}" data-budget="${budgetAmt}" data-spent="${spent}" data-remaining="${remaining}" data-is-debt="false">${cat} ${budgetAmt > 0 ? '(Pendiente: ' + formatCurrency(remaining) + ')' : ''}</option>`;
    }).join('')}
              ${debtItems.length > 0 ? `
                <optgroup label="💳 Pagos de Deudas">
                  ${debtItems.map(debt => { const currentMonth = new Date().toISOString().substring(0, 7); const paidThisMonth = appData.filter(p => p.type === 'expense' && p.debtPaymentId === debt.__backendId && p.date && p.date.substring(0, 7) === currentMonth).reduce((sum, p) => sum + (p.amount || 0), 0); const pendingPayment = Math.min(Math.max((debt.debtMinPayment || 0) - paidThisMonth, 0), debt.debtCurrent || 0); return `<option value="debt_${debt.__backendId}" data-debt-id="${debt.__backendId}" data-is-debt="true" data-debt-name="${debt.debtName}" data-debt-minpay="${pendingPayment}">${debt.debtName} (Cuota: ${formatCurrency(pendingPayment)}${pendingPayment === 0 ? ' · Cancelada' : ''})</option>`; }).join('')}
                </optgroup>
              ` : ''}
            </select>
          </div>

          <div id="quick-pay-section" class="hidden">
            <div class="gradient-light rounded-xl p-4 mb-4">
              <p class="text-sm text-gray-600 mb-1">Monto presupuestado</p>
              <p id="budgeted-amount" class="text-xl font-bold gradient-text">$0</p>
              <div class="flex gap-2 mt-3">
                <button onclick="setPaymentType('full')" id="pay-full-btn" class="flex-1 py-2 px-3 text-sm rounded-lg border-2 border-purple-300 bg-purple-50 font-medium">Pago Total</button>
                <button onclick="setPaymentType('partial')" id="pay-partial-btn" class="flex-1 py-2 px-3 text-sm rounded-lg border-2 border-gray-200 font-medium">Abono</button>
              </div>
            </div>
          </div>

          <div>
            <label class="text-sm text-gray-600 block mb-2">Monto</label>
            <input type="number" id="expense-amount" class="w-full px-4 py-4 text-xl border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-300 outline-none" placeholder="0">
          </div>

          <input type="hidden" id="payment-type" value="full">
          <input type="hidden" id="is-debt-payment" value="false">
          <input type="hidden" id="debt-payment-id" value="">

          <button onclick="saveExpense()" class="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-lg btn-press mt-6">
            Guardar Movimiento
          </button>
        </div>
      `;
}

function onCategoryChange() {
    const select = document.getElementById('expense-category');
    const selectedOption = select.options[select.selectedIndex];
    const isDept = selectedOption.dataset.isDebt === 'true';

    if (isDept) {
        // Debt payment mode
        const debtId = selectedOption.dataset.debtId;
        const debtMinPay = parseFloat(selectedOption.dataset.debtMinpay) || 0;
        const debtName = selectedOption.dataset.debtName;

        document.getElementById('is-debt-payment').value = 'true';
        document.getElementById('debt-payment-id').value = debtId;
        document.getElementById('quick-pay-section').classList.remove('hidden');
        document.getElementById('budgeted-amount').innerHTML = `
          <div class="text-sm text-gray-600 mb-1">Pago mínimo de ${debtName}</div>
          <p class="text-2xl font-bold gradient-text">${formatCurrency(debtMinPay)}</p>
        `;
        document.getElementById('expense-amount').value = debtMinPay;
        document.getElementById('payment-type').value = 'full';

        // Reset payment type buttons
        document.getElementById('pay-full-btn').classList.add('border-purple-300', 'bg-purple-50');
        document.getElementById('pay-full-btn').classList.remove('border-gray-200');
        document.getElementById('pay-partial-btn').classList.remove('border-purple-300', 'bg-purple-50');
        document.getElementById('pay-partial-btn').classList.add('border-gray-200');
    } else {
        // Regular budget category
        const budget = parseFloat(selectedOption.dataset.budget) || 0;
        const spent = parseFloat(selectedOption.dataset.spent) || 0;
        const remaining = parseFloat(selectedOption.dataset.remaining) || 0;

        document.getElementById('is-debt-payment').value = 'false';
        document.getElementById('debt-payment-id').value = '';

        if (budget > 0) {
            document.getElementById('quick-pay-section').classList.remove('hidden');

            // Show pending amount instead of total budget
            const statusText = spent > 0 ? `Gastado: ${formatCurrency(spent)} | ` : '';
            document.getElementById('budgeted-amount').innerHTML = `
            <div class="text-sm text-gray-600 mb-1">${statusText}Pendiente: ${formatCurrency(remaining)}</div>
            <p class="text-2xl font-bold gradient-text">${formatCurrency(remaining)}</p>
          `;

            document.getElementById('expense-amount').value = remaining;
            document.getElementById('payment-type').value = 'full';

            // Reset payment type buttons
            document.getElementById('pay-full-btn').classList.add('border-purple-300', 'bg-purple-50');
            document.getElementById('pay-full-btn').classList.remove('border-gray-200');
            document.getElementById('pay-partial-btn').classList.remove('border-purple-300', 'bg-purple-50');
            document.getElementById('pay-partial-btn').classList.add('border-gray-200');
        } else {
            document.getElementById('quick-pay-section').classList.add('hidden');
            document.getElementById('expense-amount').value = '';
        }
    }
}

function setPaymentType(type) {
    document.getElementById('payment-type').value = type;
    const select = document.getElementById('expense-category');
    const selectedOption = select.options[select.selectedIndex];
    const budget = parseFloat(selectedOption.dataset.budget) || 0;
    const spent = parseFloat(selectedOption.dataset.spent) || 0;
    const remaining = Math.max(budget - spent, 0);

    const fullBtn = document.getElementById('pay-full-btn');
    const partialBtn = document.getElementById('pay-partial-btn');

    if (type === 'full') {
        fullBtn.classList.add('border-purple-300', 'bg-purple-50');
        fullBtn.classList.remove('border-gray-200');
        partialBtn.classList.remove('border-purple-300', 'bg-purple-50');
        partialBtn.classList.add('border-gray-200');
        document.getElementById('expense-amount').value = remaining;
    } else {
        partialBtn.classList.add('border-purple-300', 'bg-purple-50');
        partialBtn.classList.remove('border-gray-200');
        fullBtn.classList.remove('border-purple-300', 'bg-purple-50');
        fullBtn.classList.add('border-gray-200');
        document.getElementById('expense-amount').value = '';
        document.getElementById('expense-amount').focus();
    }
}


async function saveExpense() {
    const categorySelect = document.getElementById('expense-category');
    const amount = parseFloat(
        document.getElementById('expense-amount')?.value
    ) || 0;

    const isPartial =
        document.getElementById('payment-type')?.value === 'partial';

    const isDebtPayment =
        document.getElementById('is-debt-payment')?.value === 'true';

    const debtPaymentId =
        document.getElementById('debt-payment-id')?.value;

    if (!categorySelect?.value) {
        showToast('Selecciona una categoría', 'warning');
        return;
    }

    if (amount <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }

    if (appData.length >= 999) {
        showToast('Límite de registros alcanzado', 'error');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        // ==========================================
        // PAGO DE DEUDA
        // ==========================================
        if (isDebtPayment && debtPaymentId) {

            const debt = appData.find(
                d => (d.id || d.__backendId) === debtPaymentId
            );

            if (!debt) {
                showToast('Deuda no encontrada', 'error');
                return;
            }

            const currentBalance = Number(debt.debtCurrent) || 0;

            if (amount > currentBalance) {
                showToast(
                    `El pago no puede exceder el saldo de ${formatCurrency(currentBalance)}`,
                    'warning'
                );
                return;
            }

            // Registrar pago como gasto
            const { data: payment, error: paymentError } =
                await supabaseClient
                    .from('transactions')
                    .insert({
                        user_id: user.id,
                        type: 'expense',
                        category: 'Deudas',
                        amount: amount,
                        transaction_date: new Date().toISOString(),
                        is_partial: false,
                        impulsive_spend: false,
                        debt_id: debt.id
                    })
                    .select()
                    .single();

            if (paymentError) {
                console.error('Error registrando pago:', paymentError);
                showToast(
                    'No se pudo registrar el pago. Intenta nuevamente.',
                    'error'
                );
                return;
            }

            // Actualizar datos locales del pago
            appData.push(mapTransactionFromSupabase(payment));

            // Calcular nuevo saldo
            const newBalance = Math.max(currentBalance - amount, 0);
            const isCompleted = newBalance <= 0;

            // Actualizar deuda en Supabase
            const { data: updatedDebt, error: debtError } =
                await supabaseClient
                    .from('debts')
                    .update({
                        current_balance: newBalance,
                        is_liquidated: isCompleted
                    })
                    .eq('id', debt.id)
                    .eq('user_id', user.id)
                    .select()
                    .single();

            if (debtError) {
                console.error('Error actualizando deuda:', debtError);

                showToast(
                    'El pago se registró, pero no se pudo actualizar el saldo de la deuda',
                    'error'
                );

                registerMode = null;
                renderCurrentPage();
                return;
            }

            // Actualizar deuda localmente
            const mappedDebt = mapDebtFromSupabase(updatedDebt);

            appData = appData.map(d =>
                (d.id || d.__backendId) === debt.id
                    ? mappedDebt
                    : d
            );

            showToast(`Pago registrado: ${formatCurrency(amount)}`);

            if (isCompleted) {
                triggerVictoryAnimation(debt.debtName);

                showToast(
                    `🎉 ¡${debt.debtName} liquidada!`,
                    'success'
                );

                showToast(
                    `💰 Bola de nieve aumentada en ${formatCurrency(debt.debtMinPayment)}`,
                    'success'
                );
            }

        } else {

            // ==========================================
            // GASTO NORMAL
            // ==========================================

            const category = categorySelect.value;

            const { data: expense, error: expenseError } =
                await supabaseClient
                    .from('transactions')
                    .insert({
                        user_id: user.id,
                        type: 'expense',
                        category: category,
                        amount: amount,
                        transaction_date: new Date().toISOString(),
                        is_partial: isPartial,
                        impulsive_spend: false
                    })
                    .select()
                    .single();

            if (expenseError) {
                console.error('Error registrando gasto:', expenseError);

                showToast(
                    'No se pudo registrar el gasto. Intenta nuevamente.',
                    'error'
                );
                return;
            }

            // Actualizar datos locales
            appData.push(mapTransactionFromSupabase(expense));

            showToast('Gasto registrado ✓');

            // Calcular dinero disponible
            const income = appData
                .filter(d => d.type === 'income')
                .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

            const expenses = appData
                .filter(d => d.type === 'expense')
                .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

            showToast(
                `Disponible: ${formatCurrency(income - expenses)}`,
                'success'
            );

            // Mostrar modal de control diario
            setTimeout(() => {
                const todayStr = new Date().toISOString().split('T')[0];

                document.getElementById('daily-spent').textContent =
                    formatCurrency(amount);

                document.getElementById('daily-check-modal')
                    .classList.remove('hidden');

                document.getElementById('daily-check-modal')
                    .classList.add('flex');

            }, 300);
        }

        registerMode = null;
        renderCurrentPage();

    } catch (error) {
        console.error('Error inesperado registrando gasto:', error);
        showToast('Ocurrió un error al registrar el gasto.', 'error');
    }
}

function renderGoalsPage() {
    const savingsGoal = appData.find(d => d.type === 'savings_goal');
    const savingsTarget = savingsGoal?.savingsGoal || 0;
    const savingsCurrent = savingsGoal?.savingsCurrent || 0;
    const savingsPercent = savingsTarget > 0 ? Math.min((savingsCurrent / savingsTarget) * 100, 100) : 0;

    const debtGoal = appData.find(d => d.type === 'debt_goal');
    const debtInitial = debtGoal?.debtInitial || 0;
    const debtPaid = debtGoal?.debtPaid || 0;
    const debtRemaining = Math.max(debtInitial - debtPaid, 0);
    const debtPercent = debtInitial > 0 ? Math.min((debtPaid / debtInitial) * 100, 100) : 0;

    const getMotivationalMessage = (percent) => {
        if (percent >= 100) return '🎉 ¡Meta alcanzada! ¡Felicitaciones!';
        if (percent >= 90) return '🔥 ¡Estás muy cerca de lograr tu meta!';
        if (percent >= 75) return '💪 ¡Excelente progreso! Sigue así';
        if (percent >= 50) return '🌟 ¡Vas por la mitad! No te detengas';
        if (percent >= 25) return '🚀 ¡Buen comienzo! Mantén el ritmo';
        return '✨ ¡Comienza tu camino hacia la meta!';
    };

    // Calculate expense stats
    const expenseChecks = appData.filter(d => d.type === 'daily_check');
    const necessaryCount = expenseChecks.filter(d => d.dailyCheckResponse === 'yes').length;
    const impulsiveCount = expenseChecks.filter(d => d.dailyCheckResponse === 'no').length;
    const totalChecks = necessaryCount + impulsiveCount;
    const necessaryPercent = totalChecks > 0 ? (necessaryCount / totalChecks) * 100 : 0;
    const impulsivePercent = totalChecks > 0 ? (impulsiveCount / totalChecks) * 100 : 0;

    const selectedMonth = new Date().toISOString().substring(0, 7);

    // Calculate monthly health metrics
    const getMonthlyMetrics = (monthStr) => {
        const income = appData.filter(d => d.type === 'income' && d.date && d.date.substring(0, 7) === monthStr).reduce((sum, d) => sum + (d.amount || 0), 0);
        const expenses = appData.filter(d => d.type === 'expense' && d.date && d.date.substring(0, 7) === monthStr).reduce((sum, d) => sum + (d.amount || 0), 0);
        const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

        const budgetItems = appData.filter(d => d.type === 'budget');
        let budgetControlCount = 0;
        budgetItems.forEach(budget => {
            const spent = appData.filter(d => d.type === 'expense' && d.category === budget.category && d.date && d.date.substring(0, 7) === monthStr).reduce((sum, d) => sum + (d.amount || 0), 0);
            if (budget.budgetAmount > 0 && spent <= budget.budgetAmount) budgetControlCount++;
        });
        const budgetControlPercent = budgetItems.length > 0 ? (budgetControlCount / budgetItems.length) * 100 : 0;

        return { income, expenses, savingsRate: Math.max(0, savingsRate), budgetControlPercent };
    };

    // Get last 6 months for comparison
    const currentDate = new Date();
    const monthsData = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthStr = d.toISOString().substring(0, 7);
        const metrics = getMonthlyMetrics(monthStr);
        monthsData.push({
            month: monthStr,
            label: new Date(d.getFullYear(), d.getMonth()).toLocaleDateString('es', { month: 'short', year: 'numeric' }),
            ...metrics
        });
    }

    // Find max values for scaling
    const maxSavingsRate = Math.max(...monthsData.map(m => m.savingsRate)) || 100;
    const maxBudgetControl = Math.max(...monthsData.map(m => m.budgetControlPercent)) || 100;

    return `
        <div class="space-y-6">
          <!-- Comportamiento de Gastos (ARRIBA) -->
          <div class="gradient-light rounded-2xl p-4">
            <h4 class="font-semibold mb-3">Comportamiento de Gastos</h4>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-xl p-3 text-center">
                <p class="text-xs text-gray-500">Necesarios</p>
                <p class="text-lg font-bold text-green-600">${necessaryPercent.toFixed(0)}%</p>
                <p class="text-xs text-gray-400 mt-1">${necessaryCount} registros</p>
              </div>
              <div class="bg-white rounded-xl p-3 text-center">
                <p class="text-xs text-gray-500">Impulsivos*</p>
                <p class="text-lg font-bold text-red-600">${impulsivePercent.toFixed(0)}%</p>
                <p class="text-xs text-gray-400 mt-1">${impulsiveCount} registros</p>
              </div>
            </div>
            <div class="mt-3 h-3 bg-gray-200 rounded-full overflow-hidden flex">
              <div class="bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all" style="width: ${necessaryPercent}%"></div>
              <div class="bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all" style="width: ${impulsivePercent}%"></div>
            </div>
            ${totalChecks > 0 ? `<p class="text-xs text-gray-500 text-center mt-2">Basado en ${totalChecks} evaluaciones diarias</p>` : '<p class="text-xs text-gray-500 text-center mt-2">Responde al chequeo diario para ver análisis</p>'}
            <div class="mt-3 pt-3 border-t border-gray-200">
              <p class="text-xs text-gray-400">*Impulsivos: Gastos que exceden el 100% del presupuesto asignado por categoría</p>
            </div>
          </div>

          <!-- Meta de Ahorro (SEGUNDO) -->
          <div class="bg-white rounded-2xl p-5 card-shadow border border-gray-100">
            <div class="flex justify-between items-start mb-4">
              <div>
                <h3 class="font-semibold text-lg">Meta de Ahorro</h3>
                <p class="text-sm text-gray-500">${getMotivationalMessage(savingsPercent)}</p>
              </div>
              <button onclick="editSavingsGoal()" class="text-gray-400 hover:text-gray-600 p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
            </div>
            
            <div class="text-center mb-4">
              <p class="text-3xl font-bold gradient-text">${formatCurrency(savingsCurrent)}</p>
              <p class="text-gray-500">de ${formatCurrency(savingsTarget)}</p>
            </div>

            <div class="h-4 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div class="h-full progress-gradient rounded-full transition-all" style="width: ${savingsPercent}%"></div>
            </div>
            
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">${savingsPercent.toFixed(0)}% completado</span>
              <span class="font-medium gradient-text">Faltan ${formatCurrency(Math.max(savingsTarget - savingsCurrent, 0))}</span>
            </div>

          </div>

          <!-- Snowball Debt System (TERCERO) -->
          <div class="bg-white rounded-2xl p-5 card-shadow border border-gray-100">
            <div class="flex justify-between items-start mb-4">
              <div>
                <h3 class="font-semibold text-lg">🎯 Estrategia Bola de Nieve</h3>
                <p class="text-sm text-gray-500">Liquida deudas de menor a mayor</p>
                <div class="flex flex-wrap gap-2 mt-3 text-xs">
                  <span class="px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 font-semibold">Saldo pendiente: ${formatCurrency(getActiveDebts().reduce((sum, d) => sum + Math.max(d.debtCurrent || 0, 0), 0))}</span>
                  <span class="px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 font-semibold">Cuotas mensuales: ${formatCurrency(getActiveDebts().reduce((sum, d) => sum + Math.max(d.debtMinPayment || 0, 0), 0))}</span>
                </div>
              </div>
              <button onclick="openAddDebtModal()" class="px-3 py-1 bg-purple-100 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors btn-press">
                + Agregar Deuda
              </button>
            </div>

            <div id="active-debts-container" class="space-y-4 mb-6">
              <p class="text-gray-500 text-center py-4">Sin deudas activas. ¡Excelente!</p>
            </div>

            <!-- Liquidated Debts Section -->
            <div id="liquidated-section" class="hidden mt-6 pt-6 border-t border-gray-200">
              <button onclick="toggleLiquidatedDebts()" class="w-full flex items-center justify-between p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
                <span class="font-semibold text-green-700">✅ Deudas Liquidadas</span>
                <svg id="liquidated-toggle-icon" class="w-5 h-5 text-green-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
              </button>
              <div id="liquidated-debts-list" class="hidden mt-3 space-y-2">
                <p class="text-gray-500 text-center py-4">Sin deudas liquidadas</p>
              </div>
            </div>

            <!-- Snowball Progress Info -->
            <div id="snowball-info" class="hidden mt-6 pt-6 border-t border-gray-200">
              <div class="bg-gradient-light rounded-xl p-4">
                <h4 class="font-semibold text-sm mb-3">💰 Flujo de Caja Liberado</h4>
                <div id="freed-cashflow" class="text-center">
                  <p class="text-3xl font-bold gradient-text">$0</p>
                  <p class="text-xs text-gray-500 mt-1">Cuota mínima acumulada disponible</p>
                </div>
                <p class="text-xs text-gray-600 mt-3 text-center">Este monto se suma a tu próximo pago para acelerar la bola de nieve 🎯</p>
              </div>
            </div>
          </div>

          <!-- Debt Modal -->
          <div id="debt-snowball-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4">
            <div class="bg-white rounded-2xl p-6 max-w-sm w-full card-shadow overflow-y-auto max-h-96">
              <h3 id="debt-modal-title" class="text-lg font-semibold mb-4">Agregar Deuda</h3>
              <input type="hidden" id="debt-modal-id" value="">
              <div class="space-y-4">
                <div>
                  <label class="text-sm text-gray-600 block mb-1">Nombre de la Deuda</label>
                  <input type="text" id="debt-name-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="Ej: Tarjeta de crédito">
                </div>
                <div>
                  <label class="text-sm text-gray-600 block mb-1">Deuda inicial</label>
                  <input type="number" id="debt-total-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="0">
                </div>
                <div>
                  <label class="text-sm text-gray-600 block mb-1">Saldo pendiente actual</label>
                  <input type="number" id="debt-current-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="0">
                </div>
                <div>
                  <label class="text-sm text-gray-600 block mb-1">Cuota Mínima Mensual</label>
                  <input type="number" id="debt-minpay-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none" placeholder="0">
                </div>
                <div>
                  <label class="text-sm text-gray-600 block mb-1">Día de Pago</label>
                  <select id="debt-payment-date-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-300 outline-none bg-white">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                    <option value="13">13</option>
                    <option value="14">14</option>
                    <option value="15" selected>15</option>
                    <option value="16">16</option>
                    <option value="17">17</option>
                    <option value="18">18</option>
                    <option value="19">19</option>
                    <option value="20">20</option>
                    <option value="21">21</option>
                    <option value="22">22</option>
                    <option value="23">23</option>
                    <option value="24">24</option>
                    <option value="25">25</option>
                    <option value="26">26</option>
                    <option value="27">27</option>
                    <option value="28">28</option>
                    <option value="29">29</option>
                    <option value="30">30</option>
                    <option value="31">31</option>
                  </select>
                </div>
              </div>
              <div class="flex gap-3 mt-6">
                <button onclick="closeDebtSnowballModal()" class="flex-1 py-3 rounded-xl border-2 border-gray-200 font-medium btn-press">Cancelar</button>
                <button onclick="saveDebtSnowball()" class="flex-1 py-3 rounded-xl gradient-primary text-white font-medium btn-press">Guardar</button>
              </div>
            </div>
          </div>

          <!-- Debt Payment Modal -->
          <div id="debt-payment-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4">
            <div class="bg-white rounded-2xl p-6 max-w-sm w-full card-shadow">
              <h3 class="text-lg font-semibold mb-2">Pagar Deuda</h3>
              <p id="payment-modal-debtname" class="text-sm text-gray-600 mb-4"></p>
              <input type="hidden" id="payment-modal-id" value="">
              <div class="space-y-4">
                <div>
                  <label class="text-sm text-gray-600 block mb-1">Monto a Pagar</label>
                  <input type="number" id="payment-amount-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-300 outline-none" placeholder="0">
                </div>
                <p id="snowball-amount" class="text-xs text-gray-500 text-center"></p>
              </div>
              <div class="flex gap-3 mt-6">
                <button onclick="closeDebtPaymentModal()" class="flex-1 py-3 rounded-xl border-2 border-gray-200 font-medium btn-press">Cancelar</button>
                <button onclick="saveDebtPayment()" class="flex-1 py-3 rounded-xl gradient-primary text-white font-medium btn-press">Registrar Pago</button>
              </div>
            </div>
          </div>

          <!-- Victory Container -->
          <div id="victory-container" class="fixed inset-0 pointer-events-none hidden"></div>

          <!-- Informes Mensuales (CUARTO) -->
          <div class="bg-white rounded-2xl p-5 card-shadow border border-gray-100">
            <h3 class="font-semibold text-lg mb-4">📈 Informe Comparativo Mensual</h3>
            <p class="text-sm text-gray-600 mb-4">Evolución de tu salud financiera en los últimos 6 meses</p>
            
            <div class="space-y-4">
              <!-- Ingresos vs Gastos -->
              <div class="mt-6">
                <h4 class="text-sm font-semibold text-purple-700 mb-3">Ingresos vs Gastos</h4>
                <div class="space-y-3">
                  ${monthsData.map(m => {
        const maxAmount = Math.max(m.income, m.expenses) || 100;
        const incomePercent = m.income > 0 ? (m.income / maxAmount) * 100 : 0;
        const expensePercent = m.expenses > 0 ? (m.expenses / maxAmount) * 100 : 0;
        return `
                      <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                          <span class="text-gray-600">${m.label}</span>
                          <span class="text-gray-500">${formatCurrency(m.income)} / ${formatCurrency(m.expenses)}</span>
                        </div>
                        <div class="flex gap-1 h-4">
                          <div class="flex-1 bg-green-300 rounded-l" style="flex: ${m.income || 0.1}; min-width: 4px;" title="Ingresos: ${formatCurrency(m.income)}"></div>
                          <div class="flex-1 bg-red-300 rounded-r" style="flex: ${m.expenses || 0.1}; min-width: 4px;" title="Gastos: ${formatCurrency(m.expenses)}"></div>
                        </div>
                      </div>
                    `;
    }).join('')}
                </div>
                <div class="flex gap-4 mt-3 text-xs">
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 bg-green-300 rounded"></div>
                    <span class="text-gray-600">Ingresos</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 bg-red-300 rounded"></div>
                    <span class="text-gray-600">Gastos</span>
                  </div>
                </div>
              </div>

              <!-- Summary -->
              <div class="bg-gradient-light rounded-xl p-4 mt-6">
                <p class="text-xs text-gray-600 mb-2">Resumen del período</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p class="text-gray-500">Tasa promedio</p>
                    <p class="font-bold text-blue-700">${(monthsData.reduce((sum, m) => sum + m.savingsRate, 0) / monthsData.length).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p class="text-gray-500">Control promedio</p>
                    <p class="font-bold text-green-700">${(monthsData.reduce((sum, m) => sum + m.budgetControlPercent, 0) / monthsData.length).toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Informe de Gastos por Mes (QUINTO) -->
          <div class="bg-white rounded-2xl p-5 card-shadow border border-gray-100">
            <h3 class="font-semibold text-lg mb-4">📊 Informe de Gastos</h3>
            
            <div class="space-y-3 mb-4">
              <div>
                <label class="text-sm text-gray-600 block mb-2">Filtrar por mes</label>
                <input type="month" id="report-month-filter" value="${selectedMonth}" onchange="updateExpenseReport()" class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-300 outline-none">
              </div>
              <div class="flex gap-2">
                <button onclick="toggleReportFilter('income')" id="report-filter-income" class="flex-1 py-2 px-3 text-sm rounded-lg border-2 border-gray-200 font-medium transition-all">
                  📥 Ingresos
                </button>
                <button onclick="toggleReportFilter('expense')" id="report-filter-expense" class="flex-1 py-2 px-3 text-sm rounded-lg border-2 border-purple-300 bg-purple-50 font-medium transition-all">
                  📤 Gastos
                </button>
              </div>
            </div>

            <div id="report-content" class="space-y-3">
              <p class="text-gray-500 text-center py-4">Selecciona un filtro para ver el informe</p>
            </div>
          </div>
        </div>

        <!-- Savings Modal -->
        <div id="savings-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full card-shadow">
            <h3 class="text-lg font-semibold mb-4">Meta de Ahorro</h3>
            <div class="space-y-4">
              <div>
                <label class="text-sm text-gray-600 block mb-1">Meta Total</label>
                <input type="number" id="savings-goal-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" placeholder="0">
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">Ahorrado Actualmente</label>
                <input type="number" id="savings-current-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" placeholder="0">
              </div>
            </div>
            <div class="flex gap-3 mt-6">
              <button onclick="closeSavingsModal()" class="flex-1 py-3 rounded-xl border-2 border-gray-200 font-medium btn-press">Cancelar</button>
              <button onclick="saveSavingsGoal()" class="flex-1 py-3 rounded-xl gradient-primary text-white font-medium btn-press">Guardar</button>
            </div>
          </div>
        </div>

        <!-- Debt Modal -->
        <div id="debt-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full card-shadow">
            <h3 class="text-lg font-semibold mb-4">Meta de Deuda</h3>
            <div class="space-y-4">
              <div>
                <label class="text-sm text-gray-600 block mb-1">Deuda Inicial</label>
                <input type="number" id="debt-initial-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" placeholder="0">
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">Total Pagado</label>
                <input type="number" id="debt-paid-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" placeholder="0">
              </div>
            </div>
            <div class="flex gap-3 mt-6">
              <button onclick="closeDebtModal()" class="flex-1 py-3 rounded-xl border-2 border-gray-200 font-medium btn-press">Cancelar</button>
              <button onclick="saveDebtGoal()" class="flex-1 py-3 rounded-xl gradient-primary text-white font-medium btn-press">Guardar</button>
            </div>
          </div>
        </div>

        <!-- Add Amount Modal -->
        <div id="add-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4">
          <div class="bg-white rounded-2xl p-6 max-w-sm w-full card-shadow">
            <h3 id="add-modal-title" class="text-lg font-semibold mb-4">Agregar</h3>
            <div>
              <label class="text-sm text-gray-600 block mb-1">Monto</label>
              <input type="number" id="add-amount-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" placeholder="0">
            </div>
            <input type="hidden" id="add-modal-type" value="">
            <div class="flex gap-3 mt-6">
              <button onclick="closeAddModal()" class="flex-1 py-3 rounded-xl border-2 border-gray-200 font-medium btn-press">Cancelar</button>
              <button onclick="saveAddAmount()" class="flex-1 py-3 rounded-xl gradient-primary text-white font-medium btn-press">Agregar</button>
            </div>
          </div>
        </div>
      `;
}

function editSavingsGoal() {
    const goal = appData.find(d => d.type === 'savings_goal');
    document.getElementById('savings-goal-input').value = goal?.savingsGoal || '';
    document.getElementById('savings-current-input').value = goal?.savingsCurrent || '';
    document.getElementById('savings-modal').classList.remove('hidden');
    document.getElementById('savings-modal').classList.add('flex');
}

function closeSavingsModal() {
    document.getElementById('savings-modal').classList.add('hidden');
    document.getElementById('savings-modal').classList.remove('flex');
}


async function saveSavingsGoal() {
    const goal = parseFloat(
        document.getElementById('savings-goal-input')?.value
    ) || 0;

    const current = parseFloat(
        document.getElementById('savings-current-input')?.value
    ) || 0;

    const existing = appData.find(
        d => d.type === 'savings_goal'
    );

    // Calcular diferencia respecto al ahorro anterior
    const previousCurrent = Number(existing?.savingsCurrent) || 0;
    const difference = current - previousCurrent;

    // Validar límite de registros
    if (!existing && appData.length >= 999) {
        showToast('Límite alcanzado', 'error');
        return;
    }

    if (difference > 0 && appData.length >= 999) {
        showToast('Límite de registros alcanzado', 'error');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        let savingsResult;
        let savingsError;

        if (existing) {

            // ==========================================
            // ACTUALIZAR META EXISTENTE
            // ==========================================

            const { data, error } = await supabaseClient
                .from('savings_goals')
                .update({
                    target_amount: goal,
                    current_amount: current
                })
                .eq('id', existing.id)
                .eq('user_id', user.id)
                .select()
                .single();

            savingsResult = data;
            savingsError = error;

        } else {

            // ==========================================
            // CREAR NUEVA META
            // ==========================================

            const { data, error } = await supabaseClient
                .from('savings_goals')
                .insert({
                    user_id: user.id,
                    target_amount: goal,
                    current_amount: current
                })
                .select()
                .single();

            savingsResult = data;
            savingsError = error;
        }

        if (savingsError) {
            console.error('Error guardando meta de ahorro:', savingsError);
            showToast('No se pudo guardar la meta de ahorro', 'error');
            return;
        }

        // Actualizar datos locales
        const mappedSavings = mapSavingsFromSupabase(savingsResult);

        if (existing) {
            appData = appData.map(d =>
                d.id === existing.id
                    ? mappedSavings
                    : d
            );
        } else {
            appData.push(mappedSavings);
        }

        // ==========================================
        // REGISTRAR MOVIMIENTO DE AHORRO
        // ==========================================

        if (difference > 0) {

            const { data: expense, error: expenseError } =
                await supabaseClient
                    .from('transactions')
                    .insert({
                        user_id: user.id,
                        type: 'expense',
                        category: 'Ahorros',
                        amount: difference,
                        method: 'Transferencia',
                        transaction_date: new Date().toISOString(),
                        is_partial: false,
                        impulsive_spend: false
                    })
                    .select()
                    .single();

            if (expenseError) {
                console.error('Error registrando movimiento de ahorro:', expenseError);

                showToast(
                    'La meta se actualizó, pero no se pudo registrar el movimiento de ahorro',
                    'error'
                );

                closeSavingsModal();
                renderCurrentPage();
                return;
            }

            // Actualizar datos locales del gasto
            appData.push(mapTransactionFromSupabase(expense));
        }

        closeSavingsModal();
        showToast('Meta actualizada ✓');

        renderCurrentPage();

    } catch (error) {
        console.error('Error inesperado guardando meta:', error);
        showToast('Ocurrió un error al guardar la meta de ahorro', 'error');
    }
}


function editDebtGoal() {
    const goal = appData.find(d => d.type === 'debt_goal');
    document.getElementById('debt-initial-input').value = goal?.debtInitial || '';
    document.getElementById('debt-paid-input').value = goal?.debtPaid || '';
    document.getElementById('debt-modal').classList.remove('hidden');
    document.getElementById('debt-modal').classList.add('flex');
}

function closeDebtModal() {
    document.getElementById('debt-modal').classList.add('hidden');
    document.getElementById('debt-modal').classList.remove('flex');
}

async function saveDebtGoal() {
    const initial = parseFloat(document.getElementById('debt-initial-input').value) || 0;
    const paid = parseFloat(document.getElementById('debt-paid-input').value) || 0;
    const existing = appData.find(d => d.type === 'debt_goal');

    if (existing) {
        const previousPaid = existing.debtPaid || 0;
        const difference = paid - previousPaid;

        await window.dataSdk.update({ ...existing, debtInitial: initial, debtPaid: paid });

        // If there's a positive difference, register it as an expense (debt payment)
        if (difference > 0 && appData.length < 999) {
            await window.dataSdk.create({
                type: 'expense',
                category: 'Deudas',
                amount: difference,
                method: 'Pago',
                date: new Date().toISOString(),
                isPartial: false
            });
        }
    } else {
        if (appData.length >= 999) { showToast('Límite alcanzado', 'error'); return; }
        await window.dataSdk.create({ type: 'debt_goal', category: 'debt', amount: 0, method: '', date: new Date().toISOString(), debtInitial: initial, debtPaid: paid });

        // Register initial debt payment as expense
        if (paid > 0 && appData.length < 999) {
            await window.dataSdk.create({
                type: 'expense',
                category: 'Deudas',
                amount: paid,
                method: 'Pago',
                date: new Date().toISOString(),
                isPartial: false
            });
        }
    }

    closeDebtModal();
    showToast('Meta actualizada');
}

// Snowball Debt System Functions
function renderDebtProgressArc() {
    const debts = appData.filter(d => d.type === 'debt_snowball');
    const initial = debts.reduce((sum, d) => sum + Math.max(Number(d.debtInitial) || 0, 0), 0);
    const remaining = debts.reduce((sum, d) => sum + Math.max(Number(d.debtCurrent) || 0, 0), 0);
    const paid = Math.max(initial - remaining, 0);
    const percent = initial > 0 ? Math.min(paid / initial * 100, 100) : 0;
    const length = Math.PI * 80;
    const dash = length * percent / 100;
    return `<div class="bg-white rounded-2xl p-5 card-shadow border border-orange-100"><div class="flex items-center gap-4"><div class="relative w-32 h-24 shrink-0"><svg viewBox="0 0 100 55" class="w-full h-full" role="img" aria-label="${percent.toFixed(0)}% de deuda liquidada"><defs><linearGradient id="debtArcGradient" x1="0" x2="1"><stop offset="0" stop-color="#DC7240"/><stop offset="1" stop-color="#B3428D"/></linearGradient></defs><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#FDE2D7" stroke-width="8" stroke-linecap="round"/><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="url(#debtArcGradient)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${length}"/></svg><span class="absolute inset-x-0 bottom-1 text-center text-xl font-bold gradient-text">${percent.toFixed(0)}%</span></div><div><p class="text-xs uppercase tracking-wide text-gray-500">Deuda liquidada</p><p class="text-xl font-bold text-gray-800">${formatCurrency(paid)}</p><p class="text-xs text-gray-500">${remaining > 0 ? `Faltan ${formatCurrency(remaining)}` : '¡Todo liberado! 🎉'}</p></div></div></div>`;
}

function getActiveDebts() {
    return appData.filter(d => d.type === 'debt_snowball' && !d.debtLiquidated).sort((a, b) => (a.debtCurrent || 0) - (b.debtCurrent || 0));
}

function getLiquidatedDebts() {
    return appData.filter(d => d.type === 'debt_snowball' && d.debtLiquidated);
}

function getTotalMinimumPayments() {
    return getLiquidatedDebts().reduce((sum, d) => sum + (d.debtMinPayment || 0), 0);
}

function renderSnowballDebts() {
    const activeDebts = getActiveDebts();
    const liquidatedDebts = getLiquidatedDebts();
    const container = document.getElementById('active-debts-container');
    const snowballInfo = document.getElementById('snowball-info');
    const liquidatedSection = document.getElementById('liquidated-section');

    if (activeDebts.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Sin deudas activas. ¡Excelente!</p>';
        snowballInfo.classList.add('hidden');
    } else {
        // Create unified list view with extended progress bars
        container.innerHTML = `
          <div class="space-y-4">
            ${activeDebts.map((debt, idx) => {
            const totalPaid = Math.max((debt.debtInitial || 0) - (debt.debtCurrent || 0), 0);
            const percent = debt.debtInitial > 0 ? Math.min(Math.max((totalPaid / debt.debtInitial) * 100, 0), 100) : 0;
            return `
                <div class="bg-white rounded-2xl card-shadow overflow-hidden border border-gray-100 debt-item-enter hover:shadow-md transition-shadow" data-debt-id="${debt.__backendId}">
                  <!-- Info sobre la barra -->
                  <div class="px-4 pt-4 pb-2">
                    <div class="flex justify-between items-center mb-2">
                      <h4 class="font-semibold text-gray-900">${debt.debtName || 'Deuda'}</h4>
                      <div class="flex items-center gap-1">
                        <button onclick="editDebtSnowball('${debt.__backendId}')" class="text-gray-400 hover:text-gray-600 p-1 transition-colors" aria-label="Editar deuda">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onclick="deleteDebtSnowball('${debt.__backendId}')" class="text-gray-400 hover:text-red-600 p-1 transition-colors" aria-label="Eliminar deuda">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </div>
                    </div>
                    
                    <!-- Información en grid -->
                    <div class="grid grid-cols-3 gap-3 text-sm mb-3">
                      <div class="bg-red-50 rounded-lg p-2">
                        <p class="text-xs text-gray-600">Deuda inicial</p>
                        <p class="font-bold text-red-600">${formatCurrency(debt.debtInitial || 0)}</p>
                      </div>
                      <div class="bg-orange-50 rounded-lg p-2">
                        <p class="text-xs text-gray-600">Saldo pendiente</p>
                        <p class="font-bold text-orange-600">${formatCurrency(Math.max(debt.debtCurrent || 0, 0))}</p>
                      </div>
                      <div class="bg-purple-50 rounded-lg p-2">
                        <p class="text-xs text-gray-600">Cuota mínima</p>
                        <p class="font-bold text-purple-600">${formatCurrency(debt.debtMinPayment || 0)}</p>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Barra de progreso -->
                  <div class="px-4 pb-4">
                    <div class="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>Progreso: ${percent.toFixed(0)}%</span>
                      <span>Pagado: ${formatCurrency(totalPaid)}</span>
                    </div>
                    <div class="h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div class="h-full bg-gradient-to-r from-green-400 to-green-500 progress-bar rounded-full" style="width: ${percent}%"></div>
                    </div>
                  </div>
                </div>
              `;
        }).join('')}
          </div>
        `;

        // Update freed cashflow
        const freedAmount = getTotalMinimumPayments();
        if (freedAmount > 0) {
            snowballInfo.classList.remove('hidden');
            document.getElementById('freed-cashflow').innerHTML = `
            <p class="text-3xl font-bold gradient-text">${formatCurrency(freedAmount)}</p>
            <p class="text-xs text-gray-500 mt-1">Cuota mínima de deudas liquidadas disponible</p>
          `;
        } else {
            snowballInfo.classList.add('hidden');
        }
    }

    // Render liquidated debts
    if (liquidatedDebts.length > 0) {
        liquidatedSection.classList.remove('hidden');
        const liquidatedList = document.getElementById('liquidated-debts-list');
        liquidatedList.innerHTML = liquidatedDebts.map(debt => `
          <div class="bg-green-50 rounded-lg p-3 border-l-4 border-green-500 flex justify-between items-center">
            <div>
              <p class="font-semibold text-green-700 text-sm">${debt.debtName || 'Deuda'}</p>
              <p class="text-xs text-gray-500">Total pagado: ${formatCurrency(debt.debtInitial || 0)}</p>
            </div>
            <span class="text-xl">✅</span>
          </div>
        `).join('');
    } else {
        liquidatedSection.classList.add('hidden');
    }
}

function openAddDebtModal() {
    document.getElementById('debt-modal-id').value = '';
    document.getElementById('debt-modal-title').textContent = 'Agregar Deuda';
    document.getElementById('debt-name-input').value = '';
    document.getElementById('debt-total-input').value = '';
    document.getElementById('debt-current-input').value = '';
    document.getElementById('debt-minpay-input').value = '';
    document.getElementById('debt-snowball-modal').classList.remove('hidden');
    document.getElementById('debt-snowball-modal').classList.add('flex');
}

function editDebtSnowball(id) {
    const debt = appData.find(d => d.__backendId === id);
    if (!debt) return;

    document.getElementById('debt-modal-id').value = id;
    document.getElementById('debt-modal-title').textContent = 'Editar Deuda';
    document.getElementById('debt-name-input').value = debt.debtName || '';
    document.getElementById('debt-total-input').value = debt.debtInitial || '';
    document.getElementById('debt-current-input').value = debt.debtCurrent || '';
    document.getElementById('debt-minpay-input').value = debt.debtMinPayment || '';
    document.getElementById('debt-payment-date-input').value = debt.debtPaymentDate || 15;
    document.getElementById('debt-snowball-modal').classList.remove('hidden');
    document.getElementById('debt-snowball-modal').classList.add('flex');
}

function closeDebtSnowballModal() {
    document.getElementById('debt-snowball-modal').classList.add('hidden');
    document.getElementById('debt-snowball-modal').classList.remove('flex');
}

let pendingDebtDeletionId = null;

async function deleteDebtSnowball(id) {
    const debt = appData.find(d => d.__backendId === id);
    if (!debt) return;
    const button = document.querySelector(`button[onclick="deleteDebtSnowball('${id}')"]`);
    if (pendingDebtDeletionId !== id) {
        pendingDebtDeletionId = id;
        if (button) {
            button.innerHTML = '¿Borrar?';
            button.className = 'text-red-600 text-xs font-semibold px-2 py-1 rounded-lg bg-red-50';
        }
        showToast('Toca “¿Borrar?” otra vez para confirmar', 'warning');
        return;
    }
    pendingDebtDeletionId = null;
    if (button) button.disabled = true;
    const result = await window.dataSdk.delete(debt);
    if (!result || !result.isOk) {
        showToast('No se pudo eliminar la deuda', 'error');
        return;
    }
    showToast('Deuda eliminada');
}


async function saveDebtSnowball() {
    const id = document.getElementById('debt-modal-id').value;
    const name = document.getElementById('debt-name-input').value.trim();
    const total = parseFloat(
        document.getElementById('debt-total-input').value
    ) || 0;

    const current = parseFloat(
        document.getElementById('debt-current-input').value
    ) || 0;

    const minpay = parseFloat(
        document.getElementById('debt-minpay-input').value
    ) || 0;

    const payDate = parseInt(
        document.getElementById('debt-payment-date-input').value
    ) || 15;

    // Validaciones
    if (!name) {
        showToast('Ingresa un nombre para la deuda', 'warning');
        return;
    }

    if (total <= 0) {
        showToast('El saldo total debe ser mayor a 0', 'warning');
        return;
    }

    if (current < 0 || current > total) {
        showToast('El saldo actual debe estar entre 0 y el total', 'warning');
        return;
    }

    if (minpay < 0) {
        showToast('La cuota mínima no puede ser negativa', 'warning');
        return;
    }

    if (payDate < 1 || payDate > 31) {
        showToast('El día debe estar entre 1 y 31', 'warning');
        return;
    }

    if (!id && appData.length >= 999) {
        showToast('Límite alcanzado', 'error');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        // Datos de la deuda para Supabase
        const debtData = {
            name: name,
            initial_amount: total,
            current_balance: current,
            min_payment: minpay,
            payment_day: payDate
        };

        if (id) {

            // ==========================================
            // ACTUALIZAR DEUDA EXISTENTE
            // ==========================================

            const existing = appData.find(
                d => (d.id || d.__backendId) === id
            );

            if (!existing) {
                showToast('No se encontró la deuda', 'error');
                return;
            }

            const { data: updatedDebt, error: updateError } =
                await supabaseClient
                    .from('debts')
                    .update(debtData)
                    .eq('id', id)
                    .eq('user_id', user.id)
                    .select()
                    .single();

            if (updateError) {
                console.error('Error actualizando deuda:', updateError);
                showToast('No se pudo actualizar la deuda', 'error');
                return;
            }

            // Actualizar datos locales
            const mappedDebt = mapDebtFromSupabase(updatedDebt);

            appData = appData.map(d =>
                (d.id || d.__backendId) === id
                    ? mappedDebt
                    : d
            );

            showToast('Deuda actualizada');

        } else {

            // ==========================================
            // REGISTRAR NUEVA DEUDA
            // ==========================================

            const { data: newDebt, error: insertError } =
                await supabaseClient
                    .from('debts')
                    .insert({
                        user_id: user.id,
                        ...debtData,
                        is_liquidated: false
                    })
                    .select()
                    .single();

            if (insertError) {
                console.error('Error registrando deuda:', insertError);
                showToast('No se pudo registrar la deuda', 'error');
                return;
            }

            // Incorporar nueva deuda a los datos locales
            appData.push(mapDebtFromSupabase(newDebt));

            showToast('Deuda agregada a la bola de nieve 🎯');
        }

        closeDebtSnowballModal();
        renderCurrentPage();

    } catch (error) {
        console.error('Error inesperado guardando deuda:', error);
        showToast('Ocurrió un error al guardar la deuda', 'error');
    }
}

function openDebtPaymentModal(id) {
    const debt = appData.find(d => d.__backendId === id);
    if (!debt) return;

    const freedAmount = getTotalMinimumPayments();

    document.getElementById('payment-modal-id').value = id;
    document.getElementById('payment-modal-debtname').textContent = debt.debtName || 'Deuda';
    document.getElementById('payment-amount-input').value = debt.debtMinPayment || '';
    document.getElementById('snowball-amount').textContent = `Suma adicional disponible: ${formatCurrency(freedAmount)}`;
    document.getElementById('debt-payment-modal').classList.remove('hidden');
    document.getElementById('debt-payment-modal').classList.add('flex');
}

function closeDebtPaymentModal() {
    document.getElementById('debt-payment-modal').classList.add('hidden');
    document.getElementById('debt-payment-modal').classList.remove('flex');
}


async function saveDebtPayment() {
    const id = document.getElementById('payment-modal-id').value;
    const payment = parseFloat(
        document.getElementById('payment-amount-input').value
    ) || 0;

    const debt = appData.find(d => d.__backendId === id);

    if (!debt) return;

    if (payment <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }

    if (payment > debt.debtCurrent) {
        showToast(
            `El pago no puede exceder el saldo de ${formatCurrency(debt.debtCurrent)}`,
            'warning'
        );
        return;
    }

    const newBalance = debt.debtCurrent - payment;
    const isCompleted = newBalance <= 0;

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        // 1. Registrar el pago como una transacción
        const { data: paymentData, error: paymentError } =
            await supabase
                .from('transactions')
                .insert({
                    user_id: user.id,
                    type: 'expense',
                    category: 'Deudas',
                    amount: payment,
                    transaction_date: new Date().toISOString(),
                    is_partial: false,
                    debt_id: id
                })
                .select()
                .single();

        if (paymentError) throw paymentError;

        // 2. Actualizar el saldo de la deuda
        const { data: updatedDebt, error: debtError } =
            await supabase
                .from('debts')
                .update({
                    current_balance: Math.max(newBalance, 0),
                    is_liquidated: isCompleted
                })
                .eq('id', id)
                .eq('user_id', user.id)
                .select()
                .single();

        if (debtError) {
            showToast(
                'El pago se guardó, pero no se pudo actualizar el saldo',
                'error'
            );
            return;
        }

        // 3. Actualizar los datos locales
        appData.push(mapTransactionFromSupabase(paymentData));

        Object.assign(debt, mapDebtFromSupabase(updatedDebt));

        closeDebtPaymentModal();

        // 4. Comprobar si la deuda fue liquidada
        if (isCompleted) {
            triggerVictoryAnimation(debt.debtName);

            showToast(
                `🎉 ¡${debt.debtName} liquidada!`,
                'success'
            );

            showToast(
                `💰 Bola de nieve aumentada en ${formatCurrency(debt.debtMinPayment)}`,
                'success'
            );
        } else {
            showToast(`Pago registrado: ${formatCurrency(payment)}`);
        }

    } catch (error) {
        console.error('Error registrando pago de deuda:', error);
        showToast('No se pudo registrar el pago', 'error');
    }
}

function triggerVictoryAnimation(debtName) {
    const container = document.getElementById('victory-container');
    container.classList.remove('hidden');

    // Create confetti pieces
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece fixed pointer-events-none';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '50%';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.background = ['#B3428D', '#DC7240', '#8B5CF6', '#06B6D4', '#10B981'][Math.floor(Math.random() * 5)];
        confetti.style.borderRadius = '50%';
        container.appendChild(confetti);

        setTimeout(() => confetti.remove(), 2500);
    }

    setTimeout(() => {
        container.classList.add('hidden');
    }, 2600);
}

function toggleLiquidatedDebts() {
    const list = document.getElementById('liquidated-debts-list');
    const icon = document.getElementById('liquidated-toggle-icon');
    list.classList.toggle('hidden');
    icon.style.transform = list.classList.contains('hidden') ? 'rotateX(0)' : 'rotateX(180deg)';
}

function openQuickSavings() {
    const modal = document.getElementById('quick-savings-modal');
    document.getElementById('quick-savings-amount').value = '';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => document.getElementById('quick-savings-amount')?.focus(), 50);
}

function closeQuickSavings() {
    const modal = document.getElementById('quick-savings-modal');
    modal.classList.add('hidden'); modal.classList.remove('flex');
}



async function saveQuickSavings() {
    const amount = parseFloat(
        document.getElementById('quick-savings-amount').value
    ) || 0;

    if (amount <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        const existing = appData.find(
            d => d.type === 'savings_goal'
        );

        const now = new Date().toISOString();

        let savingsData;
        let savingsError;

        if (existing) {
            // Actualizar ahorro existente
            const newCurrent =
                (Number(existing.savingsCurrent) || 0) + amount;

            const result = await supabaseClient
                .from('savings_goals')
                .update({
                    current_amount: newCurrent
                })
                .eq('id', existing.__backendId)
                .eq('user_id', user.id)
                .select()
                .single();

            savingsData = result.data;
            savingsError = result.error;

        } else {
            // Crear nueva meta de ahorro
            const result = await supabaseClient
                .from('savings_goals')
                .insert({
                    user_id: user.id,
                    target_amount: amount,
                    current_amount: amount
                })
                .select()
                .single();

            savingsData = result.data;
            savingsError = result.error;
        }

        if (savingsError) throw savingsError;

        // Actualizar datos locales
        const mappedSavings = mapSavingsFromSupabase(savingsData);

        if (existing) {
            Object.assign(existing, mappedSavings);
        } else {
            appData.push(mappedSavings);
        }

        // Registrar movimiento en transacciones
        const { data: transferData, error: transferError } =
            await supabaseClient
                .from('transactions')
                .insert({
                    user_id: user.id,
                    type: 'expense',
                    category: 'Ahorros',
                    amount: amount,
                    method: 'Transferencia',
                    transaction_date: now,
                    is_partial: false,
                    impulsive_spend: false
                })
                .select()
                .single();

        if (transferError) {
            console.error(
                'Error registrando transferencia:',
                transferError
            );

            showToast(
                'Ahorro actualizado, pero faltó registrar la transferencia',
                'warning'
            );

            closeQuickSavings();
            return;
        }

        // Actualizar datos locales con la transacción
        appData.push(mapTransactionFromSupabase(transferData));

        showToast(`¡${formatCurrency(amount)} ahorrados! 🌱`);

        closeQuickSavings();

    } catch (error) {
        console.error('Error actualizando ahorro:', error);
        showToast('No se pudo actualizar el ahorro', 'error');
    }
}


function addToSavings() {
    document.getElementById('add-modal-title').textContent = 'Agregar Ahorro';
    document.getElementById('add-modal-type').value = 'savings';
    document.getElementById('add-amount-input').value = '';
    document.getElementById('add-modal').classList.remove('hidden');
    document.getElementById('add-modal').classList.add('flex');
}

function addDebtPayment() {
    document.getElementById('add-modal-title').textContent = 'Registrar Pago de Deuda';
    document.getElementById('add-modal-type').value = 'debt';
    document.getElementById('add-amount-input').value = '';
    document.getElementById('add-modal').classList.remove('hidden');
    document.getElementById('add-modal').classList.add('flex');
}

function closeAddModal() {
    document.getElementById('add-modal').classList.add('hidden');
    document.getElementById('add-modal').classList.remove('flex');
}


async function saveAddAmount() {
    const amount = parseFloat(
        document.getElementById('add-amount-input').value
    ) || 0;

    const type = document.getElementById('add-modal-type').value;

    if (amount <= 0) {
        showToast('Ingresa un monto válido', 'warning');
        return;
    }

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        const now = new Date().toISOString();

        if (type === 'savings') {

            // Buscar meta de ahorro existente
            const existing = appData.find(
                d => d.type === 'savings_goal'
            );

            let savingsData;
            let savingsError;

            if (existing) {
                // Incrementar ahorro acumulado
                const newCurrent =
                    (Number(existing.savingsCurrent) || 0) + amount;

                const result = await supabase
                    .from('savings_goals')
                    .update({
                        current_amount: newCurrent
                    })
                    .eq('id', existing.__backendId)
                    .eq('user_id', user.id)
                    .select()
                    .single();

                savingsData = result.data;
                savingsError = result.error;

            } else {
                // Crear meta inicial de ahorro
                const result = await supabase
                    .from('savings_goals')
                    .insert({
                        user_id: user.id,
                        target_amount: amount,
                        current_amount: amount
                    })
                    .select()
                    .single();

                savingsData = result.data;
                savingsError = result.error;
            }

            if (savingsError) throw savingsError;

            // Actualizar datos locales
            const mappedSavings =
                mapSavingsFromSupabase(savingsData);

            if (existing) {
                Object.assign(existing, mappedSavings);
            } else {
                appData.push(mappedSavings);
            }

            // Registrar movimiento de ahorro
            const { data: transferData, error: transferError } =
                await supabase
                    .from('transactions')
                    .insert({
                        user_id: user.id,
                        type: 'expense',
                        category: 'Ahorros',
                        amount: amount,
                        method: 'Transferencia',
                        transaction_date: now,
                        is_partial: false,
                        impulsive_spend: false
                    })
                    .select()
                    .single();

            if (transferError) {
                console.error(
                    'Error registrando transferencia:',
                    transferError
                );

                showToast(
                    'Ahorro actualizado, pero faltó registrar la transferencia',
                    'warning'
                );

                closeAddModal();
                return;
            }

            // Actualizar transacciones locales
            appData.push(
                mapTransactionFromSupabase(transferData)
            );

            showToast('Ahorro agregado ✓');

        } else {

            // Abono general distribuido mediante bola de nieve
            const { data: result, error } = await supabaseClient.rpc(
                'apply_general_debt_payment',
                {
                    p_amount: amount
                }
            );

            if (error) throw error;

            // Actualizar deudas desde Supabase
            const { data: debtRows, error: refreshError } =
                await supabase
                    .from('debts')
                    .select('*')
                    .eq('user_id', user.id);

            if (refreshError) throw refreshError;

            // Sincronizar deudas locales
            debtRows.forEach(row => {
                const mapped = mapDebtFromSupabase(row);

                const existing = appData.find(
                    d => d.__backendId === mapped.__backendId
                );

                if (existing) {
                    Object.assign(existing, mapped);
                } else {
                    appData.push(mapped);
                }
            });

            // Recuperar transacción registrada por RPC
            const { data: transactionData, error: transactionError } =
                await supabase
                    .from('transactions')
                    .select('*')
                    .eq('id', result.transaction_id)
                    .eq('user_id', user.id)
                    .single();

            if (transactionError) {
                console.error(
                    'Error recuperando transacción:',
                    transactionError
                );
            } else {
                appData.push(
                    mapTransactionFromSupabase(transactionData)
                );
            }

            showToast('Pago registrado ✓');
        }

        closeAddModal();

    } catch (error) {
        console.error('Error en saveAddAmount:', error);

        showToast(
            error.message || 'No se pudo completar la operación',
            'error'
        );
    }
}

function checkNotifications() {
    notifications = [];
    const budgetItems = appData.filter(d => d.type === 'budget');
    const debtItems = appData.filter(d => d.type === 'debt_snowball' && !d.debtLiquidated);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const twentyFourHoursAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Limit notifications to first 10 for performance
    let count = 0;
    for (let i = 0; i < budgetItems.length && count < 10; i++) {
        const budget = budgetItems[i];
        const currentMonth = new Date().toISOString().substring(0, 7);
        const spent = appData.filter(d => d.type === 'expense' && d.category === budget.category && d.date && d.date.substring(0, 7) === currentMonth).reduce((sum, d) => sum + (d.amount || 0), 0);
        const total = budget.budgetAmount || 0;
        const percent = total > 0 ? (spent / total) * 100 : 0;

        // Check if notification is within 24 hours (use budget update date as reference)
        const budgetDate = budget.date ? new Date(budget.date) : today;
        const isRecent = budgetDate >= twentyFourHoursAgo;

        if (percent > 100 && isRecent) {
            notifications.push({ type: 'danger', message: `🚨 ${budget.category}: Estás excediendo el presupuesto (${percent.toFixed(0)}%)`, timestamp: budgetDate });
            count++;
        } else if (percent === 100 && isRecent) {
            notifications.push({ type: 'success', message: `✅ ${budget.category}: ¡Presupuesto cumplido!`, timestamp: budgetDate });
            count++;
        } else if (percent >= 80 && percent < 100 && isRecent) {
            notifications.push({ type: 'warning', message: `⏳ ${budget.category}: Aún falta para cumplir el pago (${percent.toFixed(0)}%)`, timestamp: budgetDate });
            count++;
        }

        if (budget.isFixed && budget.paymentDate === tomorrow.getDate()) {
            notifications.push({ type: 'reminder', message: `📅 Mañana debes pagar ${budget.category}`, timestamp: budgetDate });
            count++;
        }
    }

    // Add debt payment reminders
    for (let i = 0; i < debtItems.length && count < 10; i++) {
        const debt = debtItems[i];
        if (debt.debtPaymentDate === tomorrow.getDate()) {
            notifications.push({ type: 'reminder', message: `💳 Mañana vence el pago de ${debt.debtName} (${formatCurrency(debt.debtMinPayment || 0)})`, timestamp: new Date(debt.date) });
            count++;
        }
    }

    // Sort notifications by timestamp (most recent first)
    notifications.sort((a, b) => (b.timestamp || today) - (a.timestamp || today));

    const badge = document.getElementById('notification-badge');
    if (notifications.length > 0) {
        badge.textContent = Math.min(notifications.length, 99);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function showNotifications() {
    const list = document.getElementById('notifications-list');
    if (notifications.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-center py-8">No hay notificaciones</p>';
    } else {
        list.innerHTML = notifications.map(n => {
            let bgClass = 'bg-red-50 border border-red-200';
            if (n.type === 'warning') bgClass = 'bg-yellow-50 border border-yellow-200';
            if (n.type === 'success') bgClass = 'bg-green-50 border border-green-200';
            if (n.type === 'reminder') bgClass = 'bg-blue-50 border border-blue-200';

            return `
          <div class="p-4 rounded-xl ${bgClass}">
            <p class="text-sm font-medium">${n.message}</p>
          </div>
        `;
        }).join('');
    }
    document.getElementById('notifications-panel').classList.remove('hidden');
}

function hideNotifications() {
    document.getElementById('notifications-panel').classList.add('hidden');
}


function checkDailyModal() {
    const now = new Date();

    // Obtener fecha local YYYY-MM-DD
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');

    // Comprobar si ya existe un registro diario
    const todayCheck = appData.find(
        d => d.type === 'daily_check' &&
            d.dailyCheckDate === todayStr
    );

    // Obtener los gastos del día
    const todayExpenses = appData.filter(d => {
        if (d.type !== 'expense' || !d.date) return false;

        const expenseDate = new Date(d.date);

        const expenseDateLocal = [
            expenseDate.getFullYear(),
            String(expenseDate.getMonth() + 1).padStart(2, '0'),
            String(expenseDate.getDate()).padStart(2, '0')
        ].join('-');

        return expenseDateLocal === todayStr;
    });

    if (!todayCheck && todayExpenses.length > 0) {
        const total = todayExpenses.reduce(
            (sum, d) => sum + (Number(d.amount) || 0),
            0
        );

        document.getElementById('daily-spent').textContent =
            formatCurrency(total);

        document.getElementById('daily-check-modal').classList.remove('hidden');
        document.getElementById('daily-check-modal').classList.add('flex');
    }
}




async function answerDailyCheck(answer) {
    // Validar respuesta
    if (!['yes', 'no'].includes(answer)) {
        showToast('Respuesta no válida', 'error');
        return;
    }

    if (appData.length >= 999) {
        showToast('Límite alcanzado', 'error');
        closeDailyCheck();
        return;
    }

    // Obtener fecha local
    const now = new Date();
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');

    try {
        // Obtener usuario autenticado
        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('No existe una sesión activa.');

        // Registrar seguimiento diario
        const { data, error } = await supabaseClient
            .from('daily_checks')
            .insert({
                user_id: user.id,
                check_date: todayStr,
                response: answer
            })
            .select()
            .single();

        if (error) throw error;

        // Actualizar estado local utilizando el adaptador
        appData.push(mapDailyCheckFromSupabase(data));

        // Mostrar confirmación
        if (answer === 'no') {
            showToast('Reflexiona sobre tus gastos impulsivos', 'warning');
        } else {
            showToast('¡Bien hecho! Gastos necesarios ✓');
        }

        closeDailyCheck();

    } catch (error) {
        console.error('Error al registrar el seguimiento diario:', error);
        showToast('No se pudo guardar el seguimiento diario', 'error');
    }
}

function closeDailyCheck() {
    document.getElementById('daily-check-modal').classList.add('hidden');
    document.getElementById('daily-check-modal').classList.remove('flex');
}

async function deleteTransaction(id) {
    const transaction = appData.find(d => d.__backendId === id);
    if (!transaction) return;

    const button = document.querySelector(`button[onclick="deleteTransaction('${id}')"]`);
    if (button) {
        button.innerHTML = '✓';
        button.className = 'opacity-100 text-red-600 transition-all p-1';
        button.disabled = true;
    }

    const deleteResult = await window.dataSdk.delete(transaction);
    if (!deleteResult || !deleteResult.isOk) {
        showToast('No se pudo eliminar el registro', 'error');
        return;
    }

    // Un pago de deuda eliminado debe devolver el saldo y reactivar la deuda.
    if (transaction.debtPaymentId) {
        const debt = appData.find(d => d.__backendId === transaction.debtPaymentId);
        if (debt) {
            const restoredBalance = (debt.debtCurrent || 0) + (transaction.amount || 0);
            const restoreResult = await window.dataSdk.update({
                ...debt,
                debtCurrent: Math.min(restoredBalance, debt.debtInitial || restoredBalance),
                debtLiquidated: false
            });
            if (!restoreResult || !restoreResult.isOk) {
                showToast('Registro eliminado, pero no se pudo restaurar la deuda', 'error');
                return;
            }
            showToast(`Pago eliminado y saldo de ${debt.debtName} restaurado ✓`);
        } else {
            showToast('Pago eliminado; la deuda original ya no existe', 'warning');
        }
    } else {
        showToast('Registro eliminado');
    }
}

let reportFilter = 'expense';

function toggleReportFilter(type) {
    reportFilter = type;
    const incomeBtn = document.getElementById('report-filter-income');
    const expenseBtn = document.getElementById('report-filter-expense');

    if (type === 'income') {
        incomeBtn.classList.add('border-purple-300', 'bg-purple-50');
        incomeBtn.classList.remove('border-gray-200');
        expenseBtn.classList.remove('border-purple-300', 'bg-purple-50');
        expenseBtn.classList.add('border-gray-200');
    } else {
        expenseBtn.classList.add('border-purple-300', 'bg-purple-50');
        expenseBtn.classList.remove('border-gray-200');
        incomeBtn.classList.remove('border-purple-300', 'bg-purple-50');
        incomeBtn.classList.add('border-gray-200');
    }

    updateExpenseReport();
}

function updateExpenseReport() {
    const selectedMonth = document.getElementById('report-month-filter').value;
    if (!selectedMonth) return;

    const filteredData = appData.filter(d => {
        const isCorrectType = d.type === reportFilter;
        const isCorrectMonth = d.date && d.date.substring(0, 7) === selectedMonth;
        return isCorrectType && isCorrectMonth;
    });

    const reportContent = document.getElementById('report-content');

    if (filteredData.length === 0) {
        reportContent.innerHTML = `<p class="text-gray-500 text-center py-4">Sin ${reportFilter === 'income' ? 'ingresos' : 'gastos'} en este período</p>`;
        return;
    }

    // Group by category if expense, otherwise just by date
    let grouped = {};
    if (reportFilter === 'expense') {
        filteredData.forEach(item => {
            const category = item.category || 'Sin categoría';
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(item);
        });
    } else {
        filteredData.forEach(item => {
            const dateStr = new Date(item.date).toLocaleDateString('es');
            if (!grouped[dateStr]) grouped[dateStr] = [];
            grouped[dateStr].push(item);
        });
    }

    const total = filteredData.reduce((sum, d) => sum + (d.amount || 0), 0);
    let html = '';

    Object.entries(grouped).forEach(([key, items]) => {
        const subtotal = items.reduce((sum, d) => sum + (d.amount || 0), 0);
        const percent = total > 0 ? (subtotal / total) * 100 : 0;

        html += `
          <div class="border border-gray-100 rounded-xl p-4">
            <div class="flex justify-between items-center mb-2">
              <h4 class="font-medium text-gray-900">${key}</h4>
              <span class="text-sm font-semibold text-gray-600">${formatCurrency(subtotal)}</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div class="h-full ${reportFilter === 'income' ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-red-400 to-red-500'} rounded-full" style="width: ${percent}%"></div>
            </div>
            <p class="text-xs text-gray-500">${percent.toFixed(1)}% del total • ${items.length} transacción${items.length > 1 ? 'es' : ''}</p>
          </div>
        `;
    });

    html += `
        <div class="bg-gradient-light rounded-xl p-4 mt-4">
          <div class="flex justify-between items-center">
            <span class="font-semibold">Total ${reportFilter === 'income' ? 'Ingresos' : 'Gastos'}</span>
            <span class="text-lg font-bold gradient-text">${formatCurrency(total)}</span>
          </div>
        </div>
      `;

    reportContent.innerHTML = html;
}

function generateFinancialAdvice() {
    const budgetItems = appData.filter(d => d.type === 'budget');
    const income = appData.filter(d => d.type === 'income').reduce((sum, d) => sum + (d.amount || 0), 0);
    const expenses = appData.filter(d => d.type === 'expense').reduce((sum, d) => sum + (d.amount || 0), 0);
    const savings = appData.find(d => d.type === 'savings_goal');
    const debt = appData.find(d => d.type === 'debt_goal');

    const advice = [];

    // Analyze budget usage
    let exceedingCategories = [];
    let normalCategories = [];
    let availableCategories = [];

    budgetItems.forEach(budget => {
        const spent = appData.filter(d => d.type === 'expense' && d.category === budget.category)
            .reduce((sum, d) => sum + (d.amount || 0), 0);
        const percent = budget.budgetAmount > 0 ? (spent / budget.budgetAmount) * 100 : 0;

        if (percent > 100) {
            exceedingCategories.push({ name: budget.category, percent: percent.toFixed(0), amount: (spent - budget.budgetAmount).toFixed(0) });
        } else if (percent > 80) {
            normalCategories.push({ name: budget.category, percent: percent.toFixed(0) });
        } else if (percent < 50 && budget.budgetAmount > 0) {
            availableCategories.push({ name: budget.category, percent: percent.toFixed(0) });
        }
    });

    // General advice based on situation
    if (exceedingCategories.length > 0) {
        advice.push(`<span class="block text-red-600 font-semibold">⚠️ Categorías excedidas:</span><span class="block text-gray-700">${exceedingCategories.map(c => `${c.name} (+${c.amount})`).join(', ')}</span>`);
    }

    if (income > 0 && expenses > 0) {
        const savings_rate = ((income - expenses) / income) * 100;
        if (savings_rate < 10) {
            advice.push(`<span class="block text-yellow-700">💡 Tu tasa de ahorro es baja (${savings_rate.toFixed(0)}%). Intenta ahorrar al menos 10-20% de tus ingresos.</span>`);
        } else if (savings_rate >= 20) {
            advice.push(`<span class="block text-green-700">✅ Excelente tasa de ahorro (${savings_rate.toFixed(0)}%). ¡Mantén el ritmo!</span>`);
        }
    }

    // Distribution recommendation (50/30/20 rule)
    const necessarySpend = appData.filter(d => d.type === 'expense' &&
        ['Diezmos y ofrendas', 'Alquiler de vivienda', 'Alimentos', 'Luz', 'Agua', 'Internet', 'Teléfono', 'Educación', 'Transporte', 'Salud'].includes(d.category))
        .reduce((sum, d) => sum + (d.amount || 0), 0);

    if (income > 0) {
        const necessaryPercent = (necessarySpend / income) * 100;
        advice.push(`<span class="block text-blue-700">📊 Distribución recomendada (regla 50/30/20):<br/>• 50% necesarios, 30% deseos, 20% ahorros/deudas<br/>Tu actual: ${necessaryPercent.toFixed(0)}% en necesarios</span>`);
    }

    if (debt && debt.debtInitial > 0) {
        const debtPercent = (debt.debtPaid / debt.debtInitial) * 100;
        if (debtPercent < 50) {
            advice.push(`<span class="block text-purple-700">💪 Llevas pagado el ${debtPercent.toFixed(0)}% de tu deuda. Considera aumentar los pagos para liberarte más rápido.</span>`);
        } else if (debtPercent >= 90) {
            advice.push(`<span class="block text-green-700">🎯 ¡Estás muy cerca de terminar de pagar tu deuda! ${(100 - debtPercent).toFixed(0)}% restante.</span>`);
        }
    }

    if (normalCategories.length > 0) {
        advice.push(`<span class="block text-gray-700">⏳ Categorías en vigilancia: ${normalCategories.map(c => c.name).join(', ')}</span>`);
    }

    if (advice.length === 0) {
        advice.push(`<span class="block text-green-700">✨ ¡Vas muy bien! Mantén tu disciplina financiera y continúa monitoreando tus gastos.</span>`);
    }

    return advice;
}

function getSavingsRateZone(rate) {
    if (rate <= 0) {
        return {
            zone: 'Zona de Peligro 🚨',
            color: 'text-red-700 bg-red-50 border-red-300',
            description: 'Estás viviendo al límite o endeudándote para cubrir gastos.'
        };
    } else if (rate <= 10) {
        return {
            zone: 'Zona Frágil ⚠️',
            color: 'text-yellow-700 bg-yellow-50 border-yellow-300',
            description: 'Tienes un margen pequeño. Cualquier emergencia podría desestabilizarte.'
        };
    } else if (rate <= 20) {
        return {
            zone: 'Saludable ✅',
            color: 'text-blue-700 bg-blue-50 border-blue-300',
            description: 'Es el estándar recomendado por expertos. Permite crear un fondo de emergencia y jubilarse dignamente.'
        };
    } else {
        return {
            zone: 'Alto Rendimiento 🚀',
            color: 'text-green-700 bg-green-50 border-green-300',
            description: 'Estás en camino a la libertad financiera temprana o tienes una gran capacidad de inversión.'
        };
    }
}

function getBudgetControlStatus(percent) {
    if (percent <= 30) {
        return { status: 'Bajo Control 📉', color: 'text-orange-700 bg-orange-50 border-orange-300', description: 'Tienes mucho margen en tus presupuestos.' };
    } else if (percent <= 60) {
        return { status: 'En Progreso 📈', color: 'text-yellow-700 bg-yellow-50 border-yellow-300', description: 'Estás moderadamente cerca de tus límites.' };
    } else if (percent <= 85) {
        return { status: 'Bajo Vigilancia 🔍', color: 'text-blue-700 bg-blue-50 border-blue-300', description: 'Vas cerca de tus límites presupuestarios.' };
    } else {
        return { status: 'Crítico 🔴', color: 'text-red-700 bg-red-50 border-red-300', description: 'Estás excediendo o muy cerca del límite de varias categorías.' };
    }
}

function renderAdvisorPage() {
    // Calculate metrics for current month only
    const currentMonth = new Date().toISOString().substring(0, 7);
    const income = appData.filter(d => d.type === 'income' && d.date && localMonthKey(new Date(d.date)) === currentMonth).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const expenses = appData.filter(d => d.type === 'expense' && d.date && localMonthKey(new Date(d.date)) === currentMonth).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const savings = appData.find(d => d.type === 'savings_goal');
    const debt = appData.find(d => d.type === 'debt_goal');
    const budgetItems = appData.filter(d => d.type === 'budget');

    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    const savingsZone = getSavingsRateZone(savingsRate);

    // Calculate financial health score
    let healthScore = 50;

    if (savingsRate >= 20) healthScore += 20;
    else if (savingsRate >= 10) healthScore += 10;

    if (debt && debt.debtInitial > 0) {
        const debtRatio = (debt.debtInitial / income) * 100;
        if (debtRatio <= 35) healthScore += 15;
    } else {
        healthScore += 15;
    }

    let exceedingCount = 0;
    budgetItems.forEach(budget => {
        const spent = appData.filter(d => d.type === 'expense' && d.category === budget.category).reduce((sum, d) => sum + (d.amount || 0), 0);
        if (budget.budgetAmount > 0 && spent <= budget.budgetAmount) exceedingCount++;
    });

    const budgetControlPercent = budgetItems.length > 0 ? (exceedingCount / budgetItems.length) * 100 : 0;
    const budgetControl = getBudgetControlStatus(100 - budgetControlPercent);

    if (budgetControlPercent >= 80) healthScore += 20;
    else if (budgetControlPercent >= 50) healthScore += 10;

    const housingSpend = appData.filter(d => d.type === 'expense' && d.category === 'Alquiler de vivienda').reduce((sum, d) => sum + (d.amount || 0), 0);
    if (income > 0) {
        const housingPercent = (housingSpend / income) * 100;
        if (housingPercent <= 30) healthScore += 10;
    }

    healthScore = Math.min(100, Math.max(0, healthScore));

    const getHealthStatus = (score) => {
        if (score >= 80) return { label: 'Excelente', color: 'text-green-600', bg: 'bg-green-50' };
        if (score >= 60) return { label: 'Buena', color: 'text-blue-600', bg: 'bg-blue-50' };
        if (score >= 40) return { label: 'Regular', color: 'text-yellow-600', bg: 'bg-yellow-50' };
        return { label: 'Necesita mejora', color: 'text-red-600', bg: 'bg-red-50' };
    };

    const status = getHealthStatus(healthScore);
    const advice = generateFinancialAdvice();

    // Análisis de estrategia bola de nieve basado en los datos actuales
    const activeSnowballDebts = getActiveDebts();
    const monthlyDebtCommitment = activeSnowballDebts.reduce((sum, d) => sum + (d.debtMinPayment || 0), 0);
    const freedSnowball = getTotalMinimumPayments();
    const monthlySurplus = Math.max(income - expenses, 0);
    const targetDebt = activeSnowballDebts[0];
    let snowballTitle = 'Configura tus deudas para activar la estrategia';
    let snowballText = 'Registra tus deudas con su saldo actual y cuota mínima para recibir una recomendación personalizada.';
    if (targetDebt) {
        snowballTitle = `Prioridad: ${targetDebt.debtName}`;
        if (monthlySurplus > 0) snowballText = `Tienes un excedente aproximado de ${formatCurrency(monthlySurplus)}. Considera abonar una parte adicional a ${targetDebt.debtName}, la deuda más corta (${formatCurrency(targetDebt.debtCurrent || 0)}), mientras mantienes las cuotas mínimas de las demás.`;
        else if (monthlyDebtCommitment > income && income > 0) snowballText = `Tus cuotas mínimas representan ${((monthlyDebtCommitment / income) * 100).toFixed(0)}% de tus ingresos. Te sugiero buscar reducir gastos o aumentar ingresos para cubrirlas sin recurrir a nueva deuda.`;
        else snowballText = `Mantén las cuotas mínimas y dirige cualquier ingreso extra a ${targetDebt.debtName}. Al liquidarla, suma su cuota de ${formatCurrency(targetDebt.debtMinPayment || 0)} al siguiente saldo para acelerar el avance.`;
        if (freedSnowball > 0) snowballText += ` Ya liberaste ${formatCurrency(freedSnowball)} de cuotas de deudas liquidadas.`;
    }

    // Distribution by category (50/30/20 rule)
    const necessaryCategories = ['Diezmos y ofrendas', 'Alquiler de vivienda', 'Alimentos', 'Luz', 'Agua', 'Salud'];
    const lifestyleCategories = ['Transporte', 'Entretenimiento', 'Vestimenta', 'Educación', 'Teléfono', 'Internet'];
    const savingsCategories = ['Ahorros', 'Deudas cortas', 'Proyectos personales', 'Otros'];

    const necessarySpend = appData.filter(d => d.type === 'expense' && d.date && d.date.substring(0, 7) === currentMonth && necessaryCategories.includes(d.category)).reduce((sum, d) => sum + (d.amount || 0), 0);
    const lifestyleSpend = appData.filter(d => d.type === 'expense' && d.date && d.date.substring(0, 7) === currentMonth && lifestyleCategories.includes(d.category)).reduce((sum, d) => sum + (d.amount || 0), 0);
    const savingsSpend = appData.filter(d => d.type === 'expense' && d.date && d.date.substring(0, 7) === currentMonth && savingsCategories.includes(d.category)).reduce((sum, d) => sum + (d.amount || 0), 0);

    const totalRecommendedSpend = necessarySpend + lifestyleSpend + savingsSpend;

    const recommendedNecessary = income * 0.5;
    const recommendedLifestyle = income * 0.3;
    const recommendedSavings = income * 0.2;

    return `
        <div class="space-y-6">
          <!-- Financial Health Score -->
          <div class="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white card-shadow">
            <h2 class="text-2xl font-bold mb-4">Salud Financiera</h2>
            
            <div class="flex items-center justify-between mb-6">
              <div>
                <p class="text-6xl font-bold">${healthScore}</p>
                <p class="text-xl mt-2">${status.label}</p>
              </div>
              <div class="w-32 h-32 rounded-full border-8 border-white flex items-center justify-center">
                <div class="text-center">
                  <div class="text-4xl font-bold">${healthScore}%</div>
                </div>
              </div>
            </div>

            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span>Ingresos mensuales</span>
                <span class="font-semibold">${formatCurrency(income)}</span>
              </div>
              <div class="flex justify-between">
                <span>Gastos mensuales</span>
                <span class="font-semibold">${formatCurrency(expenses)}</span>
              </div>
              <div class="flex justify-between">
                <span>Disponible</span>
                <span class="font-semibold">${formatCurrency(Math.max(income - expenses, 0))}</span>
              </div>
            </div>
          </div>

          <!-- Savings Rate Zone -->
          <div class="border-2 ${savingsZone.color} rounded-2xl p-5 card-shadow">
            <div class="flex items-start gap-3 mb-3">
              <div class="text-3xl">📊</div>
              <div>
                <h3 class="font-semibold text-lg">${savingsZone.zone}</h3>
                <p class="text-sm mt-1">${savingsRate.toFixed(1)}% de tu ingreso</p>
              </div>
            </div>
            <p class="text-sm">${savingsZone.description}</p>
          </div>

          <!-- Budget Control Status -->
          <div class="border-2 ${budgetControl.color} rounded-2xl p-5 card-shadow">
            <div class="flex items-start gap-3 mb-3">
              <div class="text-3xl">💰</div>
              <div>
                <h3 class="font-semibold text-lg">${budgetControl.status}</h3>
                <p class="text-sm mt-1">${budgetControlPercent.toFixed(0)}% de presupuestos dentro del límite</p>
              </div>
            </div>
            <p class="text-sm">${budgetControl.description}</p>
          </div>

          <!-- Distribution by Category (50/30/20 Rule) -->
          <div class="bg-white rounded-2xl p-5 card-shadow border border-gray-100">
            <h3 class="font-semibold text-lg mb-4">📋 Distribución Recomendada 50/30/20</h3>
            
            ${income > 0 ? `
              <!-- 50% Necesidades -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h4 class="font-semibold text-blue-700">50% - Necesidades</h4>
                    <p class="text-xs text-gray-500">Gastos esenciales</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-lg text-blue-700">${formatCurrency(recommendedNecessary)}</p>
                    <p class="text-xs text-gray-500">Actual: ${formatCurrency(necessarySpend)}</p>
                  </div>
                </div>
                <div class="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div class="h-full bg-blue-500" style="width: 50%"></div>
                </div>
                <div class="space-y-1.5 ml-2">
                  ${necessaryCategories.map(cat => {
        const categorySpend = appData.filter(d => d.type === 'expense' && d.category === cat).reduce((sum, d) => sum + (d.amount || 0), 0);
        const categoryPercent = recommendedNecessary > 0 ? (categorySpend / recommendedNecessary) * 100 : 0;
        return `
                      <div class="flex justify-between text-xs">
                        <span class="text-gray-600">${cat}</span>
                        <span class="font-medium text-gray-700">${formatCurrency(categorySpend)}</span>
                      </div>
                    `;
    }).join('')}
                </div>
              </div>

              <!-- 30% Estilo de Vida -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h4 class="font-semibold text-orange-700">30% - Estilo de Vida</h4>
                    <p class="text-xs text-gray-500">Disfruta y crece</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-lg text-orange-700">${formatCurrency(recommendedLifestyle)}</p>
                    <p class="text-xs text-gray-500">Actual: ${formatCurrency(lifestyleSpend)}</p>
                  </div>
                </div>
                <div class="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div class="h-full bg-orange-500" style="width: 30%"></div>
                </div>
                <div class="space-y-1.5 ml-2">
                  ${lifestyleCategories.map(cat => {
        const categorySpend = appData.filter(d => d.type === 'expense' && d.category === cat).reduce((sum, d) => sum + (d.amount || 0), 0);
        return `
                      <div class="flex justify-between text-xs">
                        <span class="text-gray-600">${cat}</span>
                        <span class="font-medium text-gray-700">${formatCurrency(categorySpend)}</span>
                      </div>
                    `;
    }).join('')}
                </div>
              </div>

              <!-- 20% Ahorro -->
              <div class="mb-4">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h4 class="font-semibold text-green-700">20% - Ahorro</h4>
                    <p class="text-xs text-gray-500">Futuro seguro</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-lg text-green-700">${formatCurrency(recommendedSavings)}</p>
                    <p class="text-xs text-gray-500">Actual: ${formatCurrency(savingsSpend)}</p>
                  </div>
                </div>
                <div class="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div class="h-full bg-green-500" style="width: 20%"></div>
                </div>
                <div class="space-y-1.5 ml-2">
                  ${savingsCategories.map(cat => {
        const categorySpend = appData.filter(d => d.type === 'expense' && d.category === cat).reduce((sum, d) => sum + (d.amount || 0), 0);
        return `
                      <div class="flex justify-between text-xs">
                        <span class="text-gray-600">${cat}</span>
                        <span class="font-medium text-gray-700">${formatCurrency(categorySpend)}</span>
                      </div>
                    `;
    }).join('')}
                </div>
              </div>
            ` : '<p class="text-gray-500 text-center py-4">Registra ingresos para ver la distribución recomendada</p>'}
          </div>

          <!-- Snowball Strategy Analysis -->
          <div class="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-5 card-shadow border border-orange-200">
            <div class="flex items-start gap-3 mb-3">
              <div class="text-3xl">🎯</div>
              <div>
                <h3 class="font-semibold text-lg">Análisis Bola de Nieve</h3>
                <p class="text-xs text-gray-500">Estrategia personalizada para liquidar tus deudas</p>
              </div>
            </div>
            <div class="bg-white rounded-xl p-4 border-l-4 border-orange-500">
              <p class="font-semibold text-orange-700 mb-2">${snowballTitle}</p>
              <p class="text-sm text-gray-700">${snowballText}</p>
            </div>
            ${targetDebt ? `<div class="grid grid-cols-2 gap-3 mt-3 text-center"><div class="bg-white rounded-xl p-3"><p class="text-xs text-gray-500">Cuotas activas</p><p class="font-bold text-orange-700">${formatCurrency(monthlyDebtCommitment)}</p></div><div class="bg-white rounded-xl p-3"><p class="text-xs text-gray-500">Saldo prioritario</p><p class="font-bold text-orange-700">${formatCurrency(targetDebt.debtCurrent || 0)}</p></div></div>` : ''}
          </div>

          <!-- Advisor Recommendations -->
          <div class="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 card-shadow border border-purple-100">
            <div class="flex items-start gap-3 mb-4">
              <div class="text-3xl">💼</div>
              <div>
                <h3 class="font-semibold text-lg">Asesor Financiero</h3>
                <p class="text-xs text-gray-500">Recomendaciones personalizadas</p>
              </div>
            </div>
            <div class="space-y-3">
              ${advice.map(a => `<div class="bg-white rounded-xl p-3 text-sm text-gray-700 border-l-4 border-purple-500">${a}</div>`).join('')}
            </div>
          </div>


        </div>
      `;
}

// Initialize
//initApp();



//autenticación


// ========================================
// NAVEGACIÓN DE AUTENTICACIÓN
// ========================================

const authViews = {
    login: document.getElementById('login-view'),
    register: document.getElementById('register-view'),
    recovery: document.getElementById('recovery-view')
};

function showAuthView(view) {
    Object.values(authViews).forEach(container => {
        container.hidden = true;
    });

    authViews[view].hidden = false;

    if (window.lucide) {
        lucide.createIcons();
    }
}

document.getElementById('show-register').addEventListener('click', () => {
    showAuthView('register');
});

document.getElementById('show-login').addEventListener('click', () => {
    showAuthView('login');
});

document.getElementById('show-recovery').addEventListener('click', () => {
    showAuthView('recovery');
});

document.getElementById('recovery-back').addEventListener('click', () => {
    showAuthView('login');
});


function showAuthScreen() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app').style.display = 'block';
}


async function loginUser() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showToast('Ingresa tu correo y contraseña.', 'warning');
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        showToast('¡Bienvenido!', 'success');

        await initApp();

    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        showToast('No se pudo iniciar sesión. Verifica tus credenciales.', 'error');
    }
}




async function registerUser() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!email || !password) {
        showToast('Ingresa tu correo y contraseña.', 'warning');
        return;
    }

    if (password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres.', 'warning');
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) throw error;

        if (data.session) {
            showToast('¡Cuenta creada correctamente! Bienvenido.', 'success');
            await initApp();
        } else {
            showToast('Cuenta creada. Inicia sesión para continuar.', 'success');
        }

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        showToast('No se pudo crear la cuenta. Inténtalo nuevamente.', 'error');
    }
}





async function checkAuthSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error('Error al comprobar la sesión:', error);
        showAuthScreen();
        return;
    }

    if (session) {
        showAppScreen();
        await initApp();
        console.log('Usuario autenticado:', session.user.email);
    } else {
        showAuthScreen();
        console.log('No existe una sesión activa');
    }
}


function listenAuthChanges() {
    supabaseClient.auth.onAuthStateChange((event, session) => {

        if (event === 'SIGNED_IN') {
            showAppScreen();

            setTimeout(() => {
                initApp();
            }, 0);
        }

        if (event === 'SIGNED_OUT') {
            showAuthScreen();
        }

    });
}




async function initAuth() {
    listenAuthChanges();
    await checkAuthSession();
}

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await loginUser();
    });

    document.getElementById('register-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await registerUser();
    });

    if (window.lucide) {
        lucide.createIcons();
    }
    initAuth();
});