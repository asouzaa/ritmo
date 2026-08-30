import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')

const exerciseHabits = [
  { id: 'run', title: 'Corrida', meta: 'Movimento no seu ritmo', icon: '↗', color: 'mint' },
  { id: 'strength', title: 'Musculação', meta: 'Treino de força com presença', icon: '◆', color: 'rose' },
]

const fallbackHabits = [
  { id: 'bed', title: 'Arrumar a cama', meta: 'Começar o dia com intenção', icon: '◒', color: 'sage' },
  { id: 'phone', title: 'Manhã sem celular', meta: 'Primeiros 30 min protegidos', icon: '◌', color: 'lavender' },
  { id: 'read', title: 'Ler 10 páginas', meta: 'Livro técnico · leitura diária', icon: '✦', color: 'peach' },
  { id: 'study', title: 'Estudar por 1h', meta: 'Uma sessão de foco', icon: '⌁', color: 'blue' },
  { id: 'questions', title: 'Resolver 20 questões', meta: 'Praticar para fixar', icon: '⊹', color: 'yellow' },
  ...exerciseHabits,
]

const categoryById = {
  bed: 'dopamina-limpa',
  phone: 'dopamina-limpa',
  read: 'recompensa',
  study: 'foco',
  questions: 'foco',
  run: 'dopamina-limpa',
  strength: 'dopamina-limpa',
}

const categoryLabels = {
  'dopamina-limpa': 'Dopamina limpa',
  foco: 'Foco',
  recompensa: 'Recompensa',
}

const metasFlexiveis = {
  read: { sugerida: 10, rotulo: '10 páginas', unidade: 'páginas', ariaLabel: 'Páginas realizadas' },
  study: { sugerida: 60, rotulo: '1h', unidade: 'minutos', ariaLabel: 'Minutos estudados' },
  questions: { sugerida: 20, rotulo: '20 questões', unidade: 'questões', ariaLabel: 'Questões realizadas' },
  run: { semanal: 3, rotulo: '3x/semana', unidade: 'minutos', ariaLabel: 'Minutos de corrida realizados' },
  strength: { semanal: 4, rotulo: '4x/semana', unidade: 'exercícios', ariaLabel: 'Exercícios de musculação realizados' },
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`)
}

function toISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value, amount) {
  const date = typeof value === 'string' ? parseDate(value) : new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

function startOfWeek(value) {
  const date = parseDate(value)
  const distanceFromMonday = (date.getDay() + 6) % 7
  return toISO(addDays(date, -distanceFromMonday))
}

function localToday() {
  return toISO(new Date())
}

function normalizeCategory(habit) {
  const raw = String(habit.category || habit.type || habit.goal || categoryById[habit.id] || 'dopamina-limpa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ _]+/g, '-')

  if (raw.includes('recompensa')) return 'recompensa'
  if (raw.includes('foco')) return 'foco'
  return 'dopamina-limpa'
}

function normalizeData(payload, requestedDate, source = 'api') {
  const habits = Array.isArray(payload?.habits) ? [...payload.habits] : [...fallbackHabits]
  exerciseHabits.forEach((habit) => {
    if (!habits.some((item) => item.id === habit.id)) habits.push(habit)
  })
  return {
    date: payload?.date || requestedDate,
    habits: habits.map((habit) => ({ ...habit, category: normalizeCategory(habit) })),
    completed: Array.isArray(payload?.completed) ? payload.completed : [],
    source,
  }
}

async function requestJSON(path, options) {
  let response
  try {
    response = await fetch(`${API}${path}`, options)
  } catch {
    throw new Error('Não foi possível conectar à API.')
  }
  if (!response.ok) throw new Error(`A API respondeu com status ${response.status}.`)
  return response.json()
}

function App() {
  const [days, setDays] = useState({})
  const [selectedDate, setSelectedDate] = useState('')
  const [todayDate, setTodayDate] = useState('')
  const [weekStart, setWeekStart] = useState('')
  const [loadingDate, setLoadingDate] = useState('')
  const [syncingHabit, setSyncingHabit] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [realizadoPorData, setRealizadoPorData] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('ritmo-realizado-por-data')) || {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    window.localStorage.setItem('ritmo-realizado-por-data', JSON.stringify(realizadoPorData))
  }, [realizadoPorData])

  useEffect(() => {
    let active = true

    async function loadToday() {
      setLoadingDate('today')
      try {
        const payload = await requestJSON('/today')
        if (!active) return
        const date = payload.date || localToday()
        const normalized = normalizeData(payload, date)
        setDays({ [date]: normalized })
        setTodayDate(date)
        setSelectedDate(date)
        setWeekStart(startOfWeek(date))
      } catch {
        if (!active) return
        const date = localToday()
        setDays({ [date]: normalizeData({ habits: fallbackHabits, completed: [] }, date, 'local') })
        setTodayDate(date)
        setSelectedDate(date)
        setWeekStart(startOfWeek(date))
        setError('Não foi possível conectar à API. Os dados locais são apenas uma prévia e não serão salvos.')
      } finally {
        if (active) setLoadingDate('')
      }
    }

    loadToday()
    return () => { active = false }
  }, [])

  async function loadDay(date, force = false) {
    if (!force && days[date]?.source === 'api') return
    setLoadingDate(date)
    setError('')

    try {
      const payload = await requestJSON(`/habits/${date}`)
      if (payload.date && payload.date !== date) throw new Error('A API retornou uma data diferente da solicitada.')
      setDays((current) => ({ ...current, [date]: normalizeData(payload, date) }))
    } catch (requestError) {
      setDays((current) => ({
        ...current,
        [date]: current[date] || normalizeData({ habits: fallbackHabits, completed: [] }, date, 'local'),
      }))
      setError(`${requestError.message} Os dados deste dia não foram sincronizados.`)
    } finally {
      setLoadingDate('')
    }
  }

  function selectDate(date) {
    setSelectedDate(date)
    loadDay(date)
  }

  function changeWeek(amount) {
    const nextWeek = toISO(addDays(weekStart, amount * 7))
    const selectedOffset = selectedDate ? (parseDate(selectedDate).getDay() + 6) % 7 : 0
    const nextDate = toISO(addDays(nextWeek, selectedOffset))
    setWeekStart(nextWeek)
    selectDate(nextDate)
  }

  function goToToday() {
    setWeekStart(startOfWeek(todayDate))
    selectDate(todayDate)
  }

  function registrarRealizado(habitId, value) {
    const quantidade = value === '' ? '' : Math.max(0, Number(value))
    setRealizadoPorData((atual) => ({
      ...atual,
      [selectedDate]: { ...atual[selectedDate], [habitId]: quantidade },
    }))
  }

  async function toggleHabit(id) {
    const currentData = days[selectedDate]
    if (!currentData || syncingHabit) return

    const wasCompleted = currentData.completed.includes(id)
    const next = wasCompleted
      ? currentData.completed.filter((item) => item !== id)
      : [...currentData.completed, id]

    setSyncingHabit(id)
    setError('')
    setDays((current) => ({
      ...current,
      [selectedDate]: { ...current[selectedDate], completed: next },
    }))

    try {
      const result = await requestJSON(`/habits/${selectedDate}/${id}/toggle`, { method: 'POST' })
      setDays((current) => ({
        ...current,
        [selectedDate]: { ...current[selectedDate], completed: result.completed, source: 'api' },
      }))

      if (!wasCompleted) {
        const habit = currentData.habits.find((item) => item.id === id)
        setMessage(`+1 passo: ${habit.title}`)
        window.setTimeout(() => setMessage(''), 2200)
      }
    } catch (requestError) {
      setDays((current) => ({
        ...current,
        [selectedDate]: { ...current[selectedDate], completed: currentData.completed },
      }))
      setError(`${requestError.message} A alteração foi desfeita para evitar uma falsa confirmação.`)
    } finally {
      setSyncingHabit('')
    }
  }

  const week = useMemo(() => {
    if (!weekStart) return []
    return Array.from({ length: 7 }, (_, index) => {
      const date = toISO(addDays(weekStart, index))
      const dayData = days[date]
      return {
        date,
        day: parseDate(date).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
        number: parseDate(date).getDate(),
        done: Boolean(dayData?.habits.length && dayData.completed.length === dayData.habits.length),
      }
    })
  }, [days, weekStart])

  function detalhesDaMeta(habitId) {
    const meta = metasFlexiveis[habitId]
    const realizado = realizadoPorData[selectedDate]?.[habitId] ?? ''
    if (!meta) return { realizado, progresso: 0, texto: '0%' }

    if (meta.semanal) {
      const inicio = startOfWeek(selectedDate)
      const sessoes = Array.from({ length: 7 }, (_, index) => toISO(addDays(inicio, index)))
        .filter((date) => Number(realizadoPorData[date]?.[habitId]) > 0).length
      const progresso = Math.round((sessoes / meta.semanal) * 100)
      return { realizado, progresso, texto: `${sessoes} de ${meta.semanal} sessões` }
    }

    const progresso = Math.round(((Number(realizado) || 0) / meta.sugerida) * 100)
    return { realizado, progresso, texto: `${progresso}%` }
  }

  const data = days[selectedDate]
  const exerciciosRegistrados = exerciseHabits.filter((habit) => Number(realizadoPorData[selectedDate]?.[habit.id]) > 0).map((habit) => habit.id)
  const completedCount = new Set([...(data?.completed || []), ...exerciciosRegistrados]).size
  const totalHabits = data?.habits.length || 0
  const metasAtivas = data?.habits.filter((habit) => metasFlexiveis[habit.id]) || []
  const pontosDasMetas = metasAtivas.reduce((total, habit) => total + Math.min(detalhesDaMeta(habit.id).progresso / 100, 1), 0)
  const totalMonitorado = totalHabits + metasAtivas.length
  const progress = totalMonitorado ? Math.round(((completedCount + pontosDasMetas) / totalMonitorado) * 100) : 0
  const displayDate = data?.date || selectedDate || todayDate
  const isToday = displayDate === todayDate
  const longDate = displayDate
    ? parseDate(displayDate).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()
    : 'CARREGANDO DATA'
  const numericDate = displayDate ? parseDate(displayDate).toLocaleDateString('pt-BR') : '—'

  return <main className="page-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✳</span><span>ritmo</span></div>
      <div className="topbar-right"><span className="streak"><span className="flame">♨</span> 4 dias de ritmo</span><button className="avatar" aria-label="Abrir perfil">AS</button></div>
    </header>

    <section className="hero">
      <div><p className="eyebrow">{longDate}</p><h1>Um dia de cada vez.</h1><p className="subhead">Pequenas ações, uma mente mais presente.</p></div>
      <div className="hero-quote"><span>“</span><p>O foco não é fazer tudo.<br />É voltar para o que importa.</p></div>
    </section>

    <div className="week-toolbar">
      <button className="week-arrow" onClick={() => changeWeek(-1)} aria-label="Semana anterior">←</button>
      <button className="today-button" onClick={goToToday} disabled={!todayDate}>Hoje</button>
      <button className="week-arrow" onClick={() => changeWeek(1)} aria-label="Próxima semana">→</button>
    </div>
    <nav className="week-nav" aria-label="Dias da semana">
      {week.map((item) => <button key={item.date} className={`day ${item.date === selectedDate ? 'active' : ''}`} aria-current={item.date === selectedDate ? 'date' : undefined} onClick={() => selectDate(item.date)}>
        <span>{item.day}</span><strong>{item.number}</strong>{item.done && <i aria-label="Dia concluído">✓</i>}
      </button>)}
    </nav>

    {error && <div className="status-banner error" role="alert"><span>{error}</span><button onClick={() => loadDay(selectedDate, true)}>Tentar novamente</button></div>}
    {!error && loadingDate && <div className="status-banner" role="status">Carregando dados do dia…</div>}

    <section className="content-grid" aria-busy={Boolean(loadingDate)}>
      <div className="main-column">
        <div className="section-heading"><div><p className="eyebrow">{isToday ? 'SEU RITMO DE HOJE' : 'SEU RITMO DO DIA'}</p><h2>Presença, não pressa.</h2></div><span className="date-label">{numericDate}</span></div>
        <div className="category-legend" aria-label="Categorias dos hábitos">
          {Object.entries(categoryLabels).map(([key, label]) => <span key={key} className={`category-badge ${key}`}>{label}</span>)}
        </div>
        <div className="progress-card"><div className="progress-copy"><span className="progress-ring">{progress}<small>%</small></span><div><strong>Monitoramento geral do dia</strong><p>Hábitos e metas avançam juntos, no seu ritmo.</p></div></div><span className="progress-emoji">{progress === 100 ? '✦' : '◒'}</span><div className="progress-track" role="progressbar" aria-label="Progresso geral do dia" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div></div>
        <div className="habit-list">{data?.habits.map((habit) => {
          const done = data.completed.includes(habit.id)
          const meta = metasFlexiveis[habit.id]
          const { realizado, progresso: progressoMeta, texto: textoProgresso } = detalhesDaMeta(habit.id)
          const exercicioRegistrado = Boolean(meta?.semanal && Number(realizado) > 0)

          return <article key={habit.id} className={`habit-card category-${habit.category} ${meta ? 'has-flexible-goal' : ''} ${done ? 'done' : ''}`}>
            <span className={`habit-icon ${habit.color}`}>{habit.icon}</span>
            <span className="habit-info">
              <span className={`category-badge ${habit.category}`}>{categoryLabels[habit.category]}</span>
              <strong>{habit.title}</strong>
              <small>{habit.meta}</small>
              {meta && <span className="flexible-goal">
                <span className="goal-values">
                  <span className="suggested-goal"><small>{meta.semanal ? 'Referência semanal' : 'Meta sugerida'}</small><strong>{meta.rotulo}</strong></span>
                  <label className="realized-goal"><small>Realizado</small><span className="number-control"><input type="number" min="0" step="1" inputMode="numeric" value={realizado} placeholder="0" aria-label={meta.ariaLabel} onChange={(event) => registrarRealizado(habit.id, event.target.value)} /><span>{meta.unidade}</span></span></label>
                </span>
                <span className="goal-progress-copy"><small>Progresso</small><strong>{textoProgresso}</strong></span>
                <span className="goal-progress" role="progressbar" aria-label={`Progresso de ${habit.title}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(progressoMeta, 100)}><span style={{ width: `${Math.min(progressoMeta, 100)}%` }} /></span>
              </span>}
            </span>
            {meta?.semanal
              ? <span className={`checkbox ${exercicioRegistrado ? 'checked' : ''}`} role="img" aria-label={exercicioRegistrado ? `${habit.title} registrada no dia` : `${habit.title} sem registro no dia`}>{exercicioRegistrado && '✓'}</span>
              : <button type="button" className={`checkbox ${done ? 'checked' : ''}`} onClick={() => toggleHabit(habit.id)} disabled={Boolean(syncingHabit)} aria-pressed={done} aria-label={`${done ? 'Desmarcar' : 'Marcar'} ${habit.title} como concluído`}>{syncingHabit === habit.id ? '…' : done && '✓'}</button>}
          </article>
        })}</div>
        <div className="reward-note"><span>✧</span><p><strong>O prazer está no processo.</strong><br />Cada confirmação sincronizada é uma escolha feita com intenção.</p></div>
      </div>
      <aside className="side-column"><div className="focus-card"><div className="card-label"><span>◉</span> FOCO DIÁRIO</div><div className="daily-focus-list">{[
        { id: 'study', title: 'Estudo', meta: 'Meta de 1h', unit: 'min' },
        { id: 'questions', title: 'Questões', meta: 'Meta de 20 questões', unit: 'questões' },
      ].map((item) => { const details = detalhesDaMeta(item.id); return <div className="daily-focus-item" key={item.id}><div className="daily-focus-top"><div><strong>{item.title}</strong><small>{item.meta}</small></div><span>{Number(details.realizado) || 0} {item.unit}</span></div><div className="daily-focus-progress" role="progressbar" aria-label={`Progresso diário de ${item.title}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(details.progresso, 100)}><span style={{ width: `${Math.min(details.progresso, 100)}%` }} /></div><small>Realizado · {details.texto}</small></div> })}</div></div><div className="insight-card"><span className="insight-icon">☼</span><div><strong>Seu melhor horário</strong><p>Você tem concluído mais hábitos entre 7h e 9h.</p></div></div></aside>
    </section>
    {message && <div className="toast" role="status">✦ {message}</div>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
