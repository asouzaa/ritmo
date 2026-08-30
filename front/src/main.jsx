import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
const MODO_ESTATICO = !API
const CHAVE_CONCLUIDOS = 'ritmo-concluidos-por-data'
const CHAVE_REALIZADO = 'ritmo-realizado-por-data'

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
  read: { sugerida: 10, rotulo: '10 páginas', unidade: 'páginas', campo: 'pages', ariaLabel: 'Páginas realizadas' },
  study: { sugerida: 60, rotulo: '1h', unidade: 'minutos', campo: 'minutes', ariaLabel: 'Minutos estudados' },
  questions: { sugerida: 20, rotulo: '20 questões', unidade: 'questões', campo: 'quantity', ariaLabel: 'Questões realizadas' },
}

const lembretesDoDia = [
  'Ficar parada não vai te trazer resultados',
  'Você merece uma vida melhor',
  'Você diz que quer mudar, mas continua agindo igual',
  'Procrastinar é uma escolha',
  'Não é falta de tempo, é falta de prioridade',
  'O seu futuro está esperando a sua coragem',
  'No fundo, você sabe que consegue',
]

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

function lerDadosLocais(chave) {
  try {
    return JSON.parse(window.localStorage.getItem(chave)) || {}
  } catch {
    return {}
  }
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
    habits: habits.map((habit) => {
      const exercise = exerciseHabits.find((item) => item.id === habit.id)
      return { ...habit, ...(exercise ? { meta: exercise.meta } : {}), category: normalizeCategory(habit) }
    }),
    completed: Array.isArray(payload?.completed) ? payload.completed : [],
    bookProgress: payload?.bookProgress || null,
    streak: Number.isFinite(Number(payload?.streak)) ? Math.max(0, Number(payload.streak)) : 0,
    bestHabitTime: payload?.bestHabitTime || null,
    source,
  }
}

function urlDaData(date) {
  const separator = API.includes('?') ? '&' : '?'
  return `${API}${separator}date=${encodeURIComponent(date)}`
}

function progressoDoPayload(payload) {
  return Object.entries(payload?.progress || {}).reduce((valores, [habitId, progresso]) => {
    const campo = metasFlexiveis[habitId]?.campo
    if (campo && progresso[campo] !== undefined) valores[habitId] = Number(progresso[campo])
    return valores
  }, {})
}

async function requestJSON(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Não foi possível conectar à API.')
  }
  if (!response.ok) throw new Error(`A API respondeu com status ${response.status}.`)
  const payload = await response.json()
  if (payload?.error) throw new Error(payload.error)
  return payload
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
  const [concluidosPorData, setConcluidosPorData] = useState(() => lerDadosLocais(CHAVE_CONCLUIDOS))
  const [realizadoPorData, setRealizadoPorData] = useState(() => lerDadosLocais(CHAVE_REALIZADO))

  useEffect(() => {
    window.localStorage.setItem(CHAVE_CONCLUIDOS, JSON.stringify(concluidosPorData))
  }, [concluidosPorData])

  useEffect(() => {
    window.localStorage.setItem(CHAVE_REALIZADO, JSON.stringify(realizadoPorData))
  }, [realizadoPorData])

  useEffect(() => {
    let active = true

    async function loadToday() {
      if (MODO_ESTATICO) {
        const date = localToday()
        setDays({ [date]: normalizeData({ habits: fallbackHabits, completed: concluidosPorData[date] || [] }, date, 'local') })
        setTodayDate(date)
        setSelectedDate(date)
        setWeekStart(startOfWeek(date))
        return
      }

      setLoadingDate('today')
      try {
        const date = localToday()
        const payload = await requestJSON(urlDaData(date))
        if (!active) return
        const responseDate = payload.date || date
        const normalized = normalizeData(payload, responseDate)
        setDays({ [responseDate]: normalized })
        setRealizadoPorData((current) => ({ ...current, [responseDate]: progressoDoPayload(payload) }))
        setTodayDate(responseDate)
        setSelectedDate(responseDate)
        setWeekStart(startOfWeek(responseDate))
      } catch (requestError) {
        if (!active) return
        const date = localToday()
        setDays({ [date]: normalizeData({ habits: fallbackHabits, completed: [] }, date, 'local') })
        setTodayDate(date)
        setSelectedDate(date)
        setWeekStart(startOfWeek(date))
        setError(`${requestError.message} Os dados locais são apenas uma prévia e não serão salvos.`)
      } finally {
        if (active) setLoadingDate('')
      }
    }

    loadToday()
    return () => { active = false }
  }, [])

  async function loadDay(date, force = false) {
    if (MODO_ESTATICO) {
      setError('')
      setDays((current) => ({
        ...current,
        [date]: normalizeData({ habits: fallbackHabits, completed: concluidosPorData[date] || [] }, date, 'local'),
      }))
      return
    }

    if (!force && days[date]?.source === 'api') return
    setLoadingDate(date)
    setError('')

    try {
      const payload = await requestJSON(urlDaData(date))
      if (payload.date && payload.date !== date) throw new Error('A API retornou uma data diferente da solicitada.')
      setDays((current) => ({ ...current, [date]: normalizeData(payload, date) }))
      setRealizadoPorData((current) => ({ ...current, [date]: progressoDoPayload(payload) }))
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

  async function salvarProgresso(habitId, value) {
    if (MODO_ESTATICO) return
    const meta = metasFlexiveis[habitId]
    if (!meta) return

    const quantidade = value === '' ? 0 : Math.max(0, Number(value))
    setError('')
    try {
      const payload = await requestJSON(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'progress', date: selectedDate, habitId, [meta.campo]: quantidade }),
      })
      setDays((current) => ({ ...current, [selectedDate]: normalizeData(payload, selectedDate) }))
      setRealizadoPorData((current) => ({ ...current, [selectedDate]: progressoDoPayload(payload) }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function toggleHabit(id) {
    const currentData = days[selectedDate]
    if (!currentData || syncingHabit) return

    const wasCompleted = currentData.completed.includes(id)
    const next = wasCompleted
      ? currentData.completed.filter((item) => item !== id)
      : [...currentData.completed, id]

    setError('')
    setDays((current) => ({
      ...current,
      [selectedDate]: { ...current[selectedDate], completed: next },
    }))

    if (MODO_ESTATICO) {
      setConcluidosPorData((current) => ({ ...current, [selectedDate]: next }))
      if (!wasCompleted) {
        const habit = currentData.habits.find((item) => item.id === id)
        setMessage(`+1 passo: ${habit.title}`)
        window.setTimeout(() => setMessage(''), 2200)
      }
      return
    }

    setSyncingHabit(id)

    try {
      const result = await requestJSON(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'toggle', date: selectedDate, habitId: id }),
      })
      setDays((current) => ({
        ...current,
        [selectedDate]: normalizeData(result, selectedDate),
      }))
      setRealizadoPorData((current) => ({ ...current, [selectedDate]: progressoDoPayload(result) }))

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

    const progresso = Math.round(((Number(realizado) || 0) / meta.sugerida) * 100)
    return { realizado, progresso, texto: `${progresso}%` }
  }

  const data = days[selectedDate]
  const exercicioIds = new Set(['run', 'strength'])
  const possuiExercicio = Boolean(data?.habits.some((habit) => exercicioIds.has(habit.id)))
  const fezExercicio = Boolean(data?.completed.some((habitId) => exercicioIds.has(habitId)))
  const completedCount = data
    ? data.completed.filter((habitId) => !exercicioIds.has(habitId)).length + (fezExercicio ? 1 : 0)
    : 0
  const totalHabits = data
    ? data.habits.filter((habit) => !exercicioIds.has(habit.id)).length + (possuiExercicio ? 1 : 0)
    : 0
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
  const lembreteDoDia = displayDate
    ? lembretesDoDia[(parseDate(displayDate).getDay() + 6) % 7]
    : lembretesDoDia[0]
  const paginasRegistradasLocalmente = Object.values(realizadoPorData)
    .reduce((total, registros) => total + Math.max(0, Number(registros?.read) || 0), 0)
  const totalDaApi = data?.bookProgress?.totalPagesRead
  const paginasRegistradas = totalDaApi !== undefined && totalDaApi !== null
    ? Math.max(0, Number(totalDaApi) || 0)
    : paginasRegistradasLocalmente
  const paginasRestantes = Math.max(275 - paginasRegistradas, 0)
  const progressoDoLivro = Math.min(Math.round((paginasRegistradas / 275) * 100), 100)
  const diasDeRitmo = data?.streak || 0
  const melhorHorario = data?.bestHabitTime?.label || 'Ainda sem histórico'

  return <main className="page-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✳</span><span>ritmo</span></div>
      <div className="topbar-right"><span className="streak"><span className="flame">♨</span> {diasDeRitmo} {diasDeRitmo === 1 ? 'dia' : 'dias'} de ritmo</span><button className="avatar" aria-label="Abrir perfil">AS</button></div>
    </header>

    <section className="hero">
      <div><p className="eyebrow">{longDate}</p><h1>Um dia de cada vez.</h1><p className="subhead">Pequenas ações, uma mente mais presente.</p></div>
      <div className="hero-quote"><span>“</span><p>{lembreteDoDia}</p></div>
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

    {MODO_ESTATICO && <div className="status-banner" role="status">Modo local · salvo neste navegador</div>}
    {!MODO_ESTATICO && error && <div className="status-banner error" role="alert"><span>{error}</span><button onClick={() => loadDay(selectedDate, true)}>Tentar novamente</button></div>}
    {!MODO_ESTATICO && !error && loadingDate && <div className="status-banner" role="status">Carregando dados do dia…</div>}

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

          return <article key={habit.id} className={`habit-card category-${habit.category} ${meta ? 'has-flexible-goal' : ''} ${done ? 'done' : ''}`}>
            <span className={`habit-icon ${habit.color}`}>{habit.icon}</span>
            <span className="habit-info">
              <span className={`category-badge ${habit.category}`}>{categoryLabels[habit.category]}</span>
              <strong>{habit.title}</strong>
              <small>{habit.meta}</small>
              {meta && <span className="flexible-goal">
                <span className="goal-values">
                  <span className="suggested-goal"><small>Meta sugerida</small><strong>{meta.rotulo}</strong></span>
                  <label className="realized-goal"><small>Realizado</small><span className="number-control"><input type="number" min="0" step="1" inputMode="numeric" value={realizado} placeholder="0" aria-label={meta.ariaLabel} onChange={(event) => registrarRealizado(habit.id, event.target.value)} onBlur={(event) => salvarProgresso(habit.id, event.target.value)} /><span>{meta.unidade}</span></span></label>
                </span>
                <span className="goal-progress-copy"><small>Progresso</small><strong>{textoProgresso}</strong></span>
                <span className="goal-progress" role="progressbar" aria-label={`Progresso de ${habit.title}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(progressoMeta, 100)}><span style={{ width: `${Math.min(progressoMeta, 100)}%` }} /></span>
              </span>}
            </span>
            <button type="button" className={`checkbox ${done ? 'checked' : ''}`} onClick={() => toggleHabit(habit.id)} disabled={Boolean(syncingHabit)} aria-pressed={done} aria-label={`${done ? 'Desmarcar' : 'Marcar'} ${habit.title} como concluído`}>{done ? '✓' : syncingHabit === habit.id ? '…' : ''}</button>
          </article>
        })}</div>
        <div className="reward-note"><span>✧</span><p><strong>O prazer está no processo.</strong><br />Cada confirmação sincronizada é uma escolha feita com intenção.</p></div>
      </div>
      <aside className="side-column"><div className="focus-card"><div className="card-label"><span>◉</span> FOCO DIÁRIO</div><div className="daily-focus-list">{[
        { id: 'study', title: 'Estudo', meta: 'Meta de 1h', unit: 'min' },
        { id: 'questions', title: 'Questões', meta: 'Meta de 20 questões', unit: 'questões' },
      ].map((item) => { const details = detalhesDaMeta(item.id); return <div className="daily-focus-item" key={item.id}><div className="daily-focus-top"><div><strong>{item.title}</strong><small>{item.meta}</small></div><span>{Number(details.realizado) || 0} {item.unit}</span></div><div className="daily-focus-progress" role="progressbar" aria-label={`Progresso diário de ${item.title}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(details.progresso, 100)}><span style={{ width: `${Math.min(details.progresso, 100)}%` }} /></div><small>Realizado · {details.texto}</small></div> })}<div className="daily-focus-item"><div className="daily-focus-top"><div><strong>Livro técnico</strong><small>275 páginas no total</small></div><span>{paginasRegistradas} páginas</span></div><div className="daily-focus-progress" role="progressbar" aria-label="Progresso do livro técnico" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressoDoLivro}><span style={{ width: `${progressoDoLivro}%` }} /></div><small>Faltam {paginasRestantes} páginas</small></div></div></div><div className="insight-card"><span className="insight-icon">☼</span><div><strong>Seu melhor horário</strong><p>{data?.bestHabitTime ? `Você tem concluído mais hábitos entre ${melhorHorario}.` : 'Ainda não há histórico suficiente para identificar seu melhor horário.'}</p></div></div></aside>
    </section>
    {message && <div className="toast" role="status">✦ {message}</div>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
