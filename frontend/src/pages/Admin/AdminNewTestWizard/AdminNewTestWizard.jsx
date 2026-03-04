import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { generateQuestionsAI } from '../../../services/ai.service'
import ExamQuestionPanel from '../ExamQuestionPanel/ExamQuestionPanel'
import styles from './AdminNewTestWizard.module.scss'

const STEPS = [
  { id: 0, label: 'Information' },
  { id: 1, label: 'Method' },
  { id: 2, label: 'Settings' },
  { id: 3, label: 'Questions' },
  { id: 4, label: 'Grading' },
  { id: 5, label: 'Certificates' },
  { id: 6, label: 'Review' },
  { id: 7, label: 'Sessions' },
  { id: 8, label: 'Save Test' },
]

const QUESTION_TYPES = [
  { value: 'MCQ', label: 'Single Choice' },
  { value: 'MULTI', label: 'Multiple Choice' },
  { value: 'TEXT', label: 'Essay' },
  { value: 'TRUEFALSE', label: 'True / False' },
  { value: 'ORDERING', label: 'Ordering' },
  { value: 'FILLINBLANK', label: 'Fill in the Blanks' },
  { value: 'MATCHING', label: 'Matching' },
]

const CERTIFICATE_TEMPLATES = ['Classic', 'Modern', 'Simple']

const DETECTORS = [
  { key: 'face_detection', label: 'Face Detection', desc: 'Detect presence and count of faces' },
  { key: 'multi_face', label: 'Multi-Face Alert', desc: 'Alert when multiple faces detected' },
  { key: 'audio_detection', label: 'Audio Detection', desc: 'Detect speech and noise' },
  { key: 'object_detection', label: 'Object Detection', desc: 'Detect forbidden objects (phone, book)' },
  { key: 'eye_tracking', label: 'Eye Tracking', desc: 'Detect gaze deviation from screen' },
  { key: 'mouth_detection', label: 'Mouth Movement', desc: 'Detect talking during exam' },
]

export default function AdminNewTestWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { id: paramId } = useParams()
  const editId = searchParams.get('edit') || paramId

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [examId, setExamId] = useState(editId || null)

  /* ─── Step 0: Information ─── */
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [examCode, setExamCode] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [nodes, setNodes] = useState([])
  const [nodeId, setNodeId] = useState('')
  const [examTemplates, setExamTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')

  /* ─── Step 1: Method ─── */
  const [method, setMethod] = useState('manual') // 'manual' | 'generator'
  const [generatorBy, setGeneratorBy] = useState('difficulty') // 'difficulty' | 'category'
  const [generatorCount, setGeneratorCount] = useState(20)
  const [generatorDifficultyMix, setGeneratorDifficultyMix] = useState({ easy: 40, medium: 40, hard: 20 })
  const [generatorCategories, setGeneratorCategories] = useState([])
  const [generatorPools, setGeneratorPools] = useState([])
  const [generatorTagsInclude, setGeneratorTagsInclude] = useState('')
  const [generatorTagsExclude, setGeneratorTagsExclude] = useState('')
  const [generatorUniquePerCandidate, setGeneratorUniquePerCandidate] = useState(true)
  const [generatorVersionCount, setGeneratorVersionCount] = useState(3)
  const [generatorRandomSeed, setGeneratorRandomSeed] = useState('')
  const [generatorPreventReuse, setGeneratorPreventReuse] = useState(true)
  const [generatorShuffleAnswers, setGeneratorShuffleAnswers] = useState(true)
  const [generatorAdaptive, setGeneratorAdaptive] = useState(false)

  /* ─── Step 2: Settings ─── */
  const [examType, setExamType] = useState('MCQ')
  const [pageFormat, setPageFormat] = useState('one_per_page')
  const [calculatorType, setCalculatorType] = useState('none')
  const [hideMetadata, setHideMetadata] = useState(false)
  const [randomizeQuestions, setRandomizeQuestions] = useState(false)
  const [randomizeAnswers, setRandomizeAnswers] = useState(false)
  const [showProgressBar, setShowProgressBar] = useState(true)
  const [unlimitedTime, setUnlimitedTime] = useState(false)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60)
  const [proctoring, setProctoring] = useState({
    face_detection: true,
    multi_face: true,
    audio_detection: true,
    object_detection: true,
    eye_tracking: true,
    mouth_detection: false,
    fullscreen_enforce: true,
    tab_switch_detect: true,
    screen_capture: false,
    copy_paste_block: true,
    eye_deviation_deg: 12,
    mouth_open_threshold: 0.35,
    audio_rms_threshold: 0.08,
    max_face_absence_sec: 5,
    max_tab_blurs: 3,
    max_alerts_before_autosubmit: 5,
    frame_interval_ms: 3000,
    audio_chunk_ms: 3000,
    screenshot_interval_sec: 60,
  })

  /* ─── Step 3: Questions ─── */
  const [questions, setQuestions] = useState([])
  const [pools, setPools] = useState([])
  const [selectedPool, setSelectedPool] = useState('')
  const [seedCount, setSeedCount] = useState(5)
  const [questionInitError, setQuestionInitError] = useState('')
  const [panelError, setPanelError] = useState('')

  /* ─── Step 4: Grading ─── */
  const [passingScore, setPassingScore] = useState(60)
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [gradingScaleId, setGradingScaleId] = useState('')
  const [gradingScales, setGradingScales] = useState([])
  const [negativeMarking, setNegativeMarking] = useState(false)
  const [negMarkValue, setNegMarkValue] = useState(0.25)
  const [negMarkType, setNegMarkType] = useState('points')
  const [showFinalScore, setShowFinalScore] = useState(true)
  const [showQuestionScores, setShowQuestionScores] = useState(false)

  /* ─── Step 5: Certificates ─── */
  const [certEnabled, setCertEnabled] = useState(false)
  const [certTemplate, setCertTemplate] = useState('Classic')
  const [certOrientation, setCertOrientation] = useState('landscape')
  const [certTitle, setCertTitle] = useState('Certificate of Achievement')
  const [certSubtitle, setCertSubtitle] = useState('')
  const [certCompany, setCertCompany] = useState('')
  const [certSigner, setCertSigner] = useState('Examiner')
  const [certDescription, setCertDescription] = useState('This is to certify that the above named candidate has successfully completed the examination.')

  /* ─── Step 7: Sessions ─── */
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [accessMode, setAccessMode] = useState('OPEN')
  const [scheduledAt, setScheduledAt] = useState('')
  const [assignedSessions, setAssignedSessions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState('mixed')

  /* ─── Step 8: Save ─── */
  const [publishStatus, setPublishStatus] = useState('CLOSED')

  /* ─── Load lookups ─── */
  useEffect(() => {
    Promise.all([
      adminApi.courses(),
      adminApi.categories(),
      adminApi.gradingScales(),
      adminApi.questionPools(),
      adminApi.users(),
      adminApi.examTemplates(),
    ]).then(([courseRes, catRes, gsRes, poolRes, userRes, tplRes]) => {
      const courseList = courseRes.data || []
      setCourses(courseList)
      setCategories(catRes.data || [])
      setGradingScales(gsRes.data || [])
      setPools(poolRes.data || [])
      setUsers((userRes.data || []).filter(u => u.role === 'LEARNER'))
      setExamTemplates(tplRes?.data || [])
      if (courseList.length && !courseId) {
        const first = courseList[0]
        setCourseId(first.id)
        adminApi.nodes(first.id).then(({ data }) => {
          setNodes(data || [])
          if (data?.length) setNodeId(data[0].id)
        }).catch(() => setNodes([]))
      }
    }).catch(() => {})
  }, [])

  // Reload nodes when course changes
  useEffect(() => {
    if (!courseId) return
    adminApi.nodes(courseId).then(({ data }) => {
      setNodes(data || [])
      if (data?.length) {
        setNodeId(data[0].id)
      }
    }).catch(() => setNodes([]))
  }, [courseId])

  /* ─── Load existing exam for edit ─── */
  useEffect(() => {
    if (!editId) return
    adminApi.getExam(editId).then(({ data: ex }) => {
      setTitle(ex.title || '')
      setDescription(ex.description || '')
      setExamType(ex.exam_type || 'MCQ')
      setCategoryId(ex.category_id || '')
      setCourseId(ex.course_id || '')
      setNodeId(ex.node_id || '')
      setPassingScore(ex.passing_score ?? 60)
      setMaxAttempts(ex.max_attempts ?? 1)
      setGradingScaleId(ex.grading_scale_id || '')
      if (ex.proctoring_config) setProctoring(ex.proctoring_config)
      if (ex.time_limit_minutes) setTimeLimitMinutes(ex.time_limit_minutes)
      else setUnlimitedTime(true)
    }).catch(() => {})
    adminApi.getQuestions(editId).then(({ data }) => setQuestions(data || [])).catch(() => {})
  }, [editId])

  useEffect(() => {
    if (step === 3 && !examId) {
      ensureExamCreated()
    }
  }, [step, examId])

  const applyTemplate = (tplId) => {
    const tpl = examTemplates.find(t => t.id === tplId)
    if (!tpl || !tpl.config) return
    const cfg = tpl.config
    setTitle(cfg.title || title)
    setDescription(cfg.description || description)
    if (cfg.exam_type) setExamType(cfg.exam_type)
    if (cfg.category_id) setCategoryId(cfg.category_id)
    if (cfg.time_limit_minutes != null) { setUnlimitedTime(false); setTimeLimitMinutes(cfg.time_limit_minutes) }
    if (cfg.max_attempts != null) setMaxAttempts(cfg.max_attempts)
    if (cfg.passing_score != null) setPassingScore(cfg.passing_score)
    if (cfg.proctoring_config) setProctoring(cfg.proctoring_config)
    if (cfg.settings) {
      setRandomizeQuestions(!!cfg.settings.randomize_questions)
      setRandomizeAnswers(!!cfg.settings.randomize_answers)
      setShowProgressBar(cfg.settings.show_progress_bar ?? showProgressBar)
      if (cfg.settings.creation_method) setMethod(cfg.settings.creation_method)
      if (cfg.settings.generator_config) {
        const g = cfg.settings.generator_config
        if (g.strategy) setGeneratorBy(g.strategy)
        if (g.total_questions) setGeneratorCount(g.total_questions)
        if (g.difficulty_mix) setGeneratorDifficultyMix(g.difficulty_mix)
        if (g.categories) setGeneratorCategories(g.categories)
        if (g.pools) setGeneratorPools(g.pools)
        if (g.include_tags) setGeneratorTagsInclude((g.include_tags || []).join(', '))
        if (g.exclude_tags) setGeneratorTagsExclude((g.exclude_tags || []).join(', '))
        if (g.unique_per_candidate != null) setGeneratorUniquePerCandidate(!!g.unique_per_candidate)
        if (g.version_count) setGeneratorVersionCount(g.version_count)
        if (g.random_seed) setGeneratorRandomSeed(g.random_seed)
        if (g.prevent_question_reuse != null) setGeneratorPreventReuse(!!g.prevent_question_reuse)
        if (g.shuffle_answers != null) setGeneratorShuffleAnswers(!!g.shuffle_answers)
        if (g.adaptive != null) setGeneratorAdaptive(!!g.adaptive)
      }
    }
    if (cfg.certificate) {
      setCertEnabled(true)
      setCertTitle(cfg.certificate.title || certTitle)
      setCertSubtitle(cfg.certificate.subtitle || certSubtitle)
      setCertCompany(cfg.certificate.issuer || certCompany)
      setCertSigner(cfg.certificate.signer || certSigner)
    }
  }

  const buildExamData = () => ({
    title,
    node_id: nodeId || undefined,
    course_id: courseId || undefined,
    exam_type: examType,
    category_id: categoryId || undefined,
    description: description || undefined,
    passing_score: passingScore,
    max_attempts: maxAttempts,
    grading_scale_id: gradingScaleId || undefined,
    proctoring_config: proctoring,
    time_limit_minutes: unlimitedTime ? null : timeLimitMinutes,
    settings: {
      creation_method: method,
      generator_config: method === 'generator' ? {
        strategy: generatorBy,
        total_questions: generatorCount,
        difficulty_mix: generatorDifficultyMix,
        categories: generatorCategories,
        pools: generatorPools,
        include_tags: generatorTagsInclude.split(',').map(t => t.trim()).filter(Boolean),
        exclude_tags: generatorTagsExclude.split(',').map(t => t.trim()).filter(Boolean),
        unique_per_candidate: generatorUniquePerCandidate,
        version_count: generatorVersionCount,
        random_seed: generatorRandomSeed || null,
        prevent_question_reuse: generatorPreventReuse,
        shuffle_answers: generatorShuffleAnswers,
        adaptive: generatorAdaptive,
      } : null,
      page_format: pageFormat,
      calculator_type: calculatorType,
      hide_metadata: hideMetadata,
      randomize_questions: randomizeQuestions,
      randomize_answers: randomizeAnswers,
      show_progress_bar: showProgressBar,
      negative_marking: negativeMarking,
      neg_mark_value: negMarkValue,
      neg_mark_type: negMarkType,
      show_final_score: showFinalScore,
      show_question_scores: showQuestionScores,
    },
    certificate: certEnabled ? {
      template: certTemplate,
      orientation: certOrientation,
      title: certTitle,
      subtitle: certSubtitle,
      issuer: certCompany,
      signer: certSigner,
      description: certDescription,
    } : null,
    status: publishStatus,
  })

  const saveExam = async () => {
    const data = buildExamData()
    if (examId) {
      await adminApi.updateExam(examId, data)
    } else {
      const res = await adminApi.createExam(data)
      setExamId(res.data.id)
      return res.data.id
    }
    return examId
  }

  const ensureExamCreated = async () => {
    if (examId || saving) return examId
    setSaving(true)
    setQuestionInitError('')
    try {
      const newId = await saveExam()
      if (newId) {
        const { data } = await adminApi.getQuestions(newId)
        setQuestions(data || [])
      }
      return newId
    } catch (e) {
      console.error(e)
      setQuestionInitError('Could not create the exam yet. Please check required fields and try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const autoPersist = async () => {
    if (!examId) return
    try {
      await saveExam()
    } catch (e) {
      console.error(e)
      setPanelError('Autosave failed. Check your connection and try again.')
    }
  }

  const handleNext = async () => {
    setPanelError('')
    if (step === 0 && !title.trim()) return
    if (step === 1 && method === 'generator' && (!generatorCount || generatorCount < 1)) {
      setPanelError('Please set a total question count for the generator.')
      return
    }
    if (step >= 3 && questions.length === 0) {
      setPanelError('Add at least one question before continuing.')
      return
    }
    if (step === 0 && courseId && !nodeId) {
      setSaving(true)
      try {
        const { data: node } = await adminApi.createNode({ course_id: courseId, title: 'Module 1', order: 0 })
        setNodes([node])
        setNodeId(node.id)
      } catch (e) {
        console.error(e)
      } finally {
        setSaving(false)
      }
      return
    }
    // Save on important steps
    if ([0, 1, 2, 3, 4, 5].includes(step)) {
      setSaving(true)
      try { await saveExam() } catch (e) { console.error(e); setPanelError('Could not save. Please check required fields and try again.'); } finally { setSaving(false) }
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1))
  }

  const handleSeedPool = async () => {
    if (!selectedPool || !examId) return
    try {
      await adminApi.seedExamFromPool(selectedPool, examId, seedCount)
      const { data } = await adminApi.getQuestions(examId)
      setQuestions(data || [])
    } catch (e) { console.error(e) }
  }

  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) {
      setPanelError('Enter a topic for AI generation.')
      return
    }
    const ensuredId = await ensureExamCreated()
    if (!ensuredId) return
    setAiLoading(true)
    setPanelError('')
    try {
      const { data } = await generateQuestionsAI({
        topic: aiTopic,
        count: aiCount,
        difficulty: aiDifficulty === 'mixed' ? null : aiDifficulty,
        question_type: 'MCQ',
      })
      // Save generated questions to backend
      for (const [idx, q] of data.entries()) {
        await adminApi.addQuestion({
          exam_id: ensuredId,
          text: q.text,
          type: 'MCQ',
          options: q.options && q.options.length ? q.options : null,
          correct_answer: q.correct_answer || (q.options && q.options[0]) || '',
          order: questions.length + idx + 1,
          points: 1,
        })
      }
      const refreshed = await adminApi.getQuestions(ensuredId)
      setQuestions(refreshed.data || [])
    } catch (e) {
      console.error(e)
      setPanelError(e.response?.data?.detail || 'AI generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAssignSessions = async () => {
    if (!examId || selectedUsers.length === 0) return
    try {
      for (const uid of selectedUsers) {
        await adminApi.createSchedule({
          user_id: uid, exam_id: examId,
          scheduled_at: scheduledAt || new Date().toISOString(),
          access_mode: accessMode,
        })
      }
      const names = selectedUsers.map(uid => users.find(u => u.id === uid)?.user_id || uid)
      setAssignedSessions(prev => [...prev, ...names.map(n => ({ user: n, mode: accessMode, at: scheduledAt }))])
      setSelectedUsers([])
    } catch (e) { console.error(e) }
  }

  const handlePublish = async () => {
    if (questions.length === 0) {
      setPanelError('Add at least one question before publishing.')
      return
    }
    setSaving(true)
    try {
      const id = await saveExam()
      navigate('/admin/exams')
    } catch (e) { console.error(e); setPanelError(e.response?.data?.detail || 'Could not save. Please add questions and try again.') } finally { setSaving(false) }
  }

  const toggleDetector = (key) => setProctoring(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleUser = (uid) => setSelectedUsers(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])

  const filteredUsers = users.filter(u =>
    !userSearch || u.user_id?.toLowerCase().includes(userSearch.toLowerCase()) || u.name?.toLowerCase().includes(userSearch.toLowerCase())
  )

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <>
          <h3 className={styles.panelTitle}>Test Information</h3>
          {examTemplates.length > 0 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Start from Template</label>
              <div className={styles.templateRow}>
                <select className={styles.select} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  <option value="">Select template...</option>
                  {examTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className={styles.btnSecondary} type="button" disabled={!selectedTemplate} onClick={() => applyTemplate(selectedTemplate)}>Apply</button>
              </div>
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label}>Test Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input name="title" className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Midterm Examination - Computer Science" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Description</label>
            <textarea name="description" className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the test purpose, scope, and any special instructions..." />
          </div>
          <div className={styles.inputRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Course</label>
              <select
                name="course"
                className={styles.select}
                value={courseId}
                onChange={async e => {
                  const val = e.target.value
                  setCourseId(val)
                  setNodeId('')
                  try {
                    const { data } = await adminApi.nodes(val)
                    setNodes(data || [])
                    if (data?.length) setNodeId(data[0].id)
                  } catch {
                    setNodes([])
                  }
                }}
              >
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {!courses.length && <p className={styles.helper}>Create a course first to organize your exam.</p>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Module</label>
              <select name="node" className={styles.select} value={nodeId} onChange={e => setNodeId(e.target.value)}>
                <option value="">Select module...</option>
                {nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
              </select>
              {!nodes.length && courseId && <p className={styles.helper}>No modules in this course—advance and I’ll create Module 1 automatically.</p>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>External Code / ID</label>
              <input name="exam_code" className={styles.input} value={examCode} onChange={e => setExamCode(e.target.value)} placeholder="e.g. CS-101-MT" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Category</label>
              <select name="category" className={styles.select} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">No Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </>
      )

      case 1: return (
        <>
          <h3 className={styles.panelTitle}>Test Creation Method</h3>
          <div className={styles.methodCards}>
            <div className={`${styles.methodCard} ${method === 'manual' ? styles.methodCardActive : ''}`} onClick={() => setMethod('manual')}>
              <div className={styles.methodIcon}>✏️</div>
              <div className={styles.methodLabel}>Manual Selection</div>
              <div className={styles.methodDesc}>Pick questions from pools or create them manually. Define exactly which questions appear in each test version.</div>
              <div className={styles.methodRadio}>
                <input type="radio" checked={method === 'manual'} readOnly />
              </div>
            </div>
            <div className={`${styles.methodCard} ${method === 'generator' ? styles.methodCardActive : ''}`} onClick={() => setMethod('generator')}>
              <div className={styles.methodIcon}>⚡</div>
              <div className={styles.methodLabel}>Generator Mode</div>
              <div className={styles.methodDesc}>Let the system automatically select questions based on your criteria. Creates unique test versions per candidate.</div>
              <div className={styles.methodRadio}>
                <input type="radio" checked={method === 'generator'} readOnly />
              </div>
            </div>
          </div>
          {method === 'generator' && (
            <div className={styles.generatorOptions}>
              <div className={styles.aiBar}>
                <div>
                  <div className={styles.label}>AI-assisted generation</div>
                  <div className={styles.helper}>Enter a topic and let the model draft questions, then we save them into this exam.</div>
                </div>
                <div className={styles.aiControls}>
                  <input className={styles.input} style={{ maxWidth: '220px' }} placeholder="Topic or chapter" value={aiTopic} onChange={e => setAiTopic(e.target.value)} />
                  <input className={styles.inputMini} type="number" min={1} max={15} value={aiCount} onChange={e => setAiCount(Number(e.target.value))} />
                  <select className={styles.selectMini} value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value)}>
                    <option value="mixed">Mixed</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <button type="button" className={styles.btnSeed} onClick={handleAIGenerate} disabled={aiLoading}>
                    {aiLoading ? 'Generating…' : 'Generate with AI'}
                  </button>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Select Questions Based On</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--color-text)' }}>
                    <input type="radio" checked={generatorBy === 'difficulty'} onChange={() => setGeneratorBy('difficulty')} />
                    Difficulty mix
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--color-text)' }}>
                    <input type="radio" checked={generatorBy === 'category'} onChange={() => setGeneratorBy('category')} />
                    Category quotas
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Total Questions</label>
                <input className={styles.input} type="number" min={1} max={200} value={generatorCount} onChange={e => setGeneratorCount(Number(e.target.value))} style={{ maxWidth: '180px' }} />
              </div>

              <div className={styles.generatorGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Difficulty Mix (%)</label>
                  {['easy','medium','hard'].map(key => (
                    <div key={key} className={styles.sliderRow}>
                      <span className={styles.sliderLabel}>{key.toUpperCase()}</span>
                      <input
                        className={styles.slider}
                        type="range"
                        min={0}
                        max={100}
                        value={generatorDifficultyMix[key]}
                        onChange={e => setGeneratorDifficultyMix(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      />
                      <input
                        className={styles.inputMini}
                        type="number"
                        min={0}
                        max={100}
                        value={generatorDifficultyMix[key]}
                        onChange={e => setGeneratorDifficultyMix(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                  <div className={styles.helper}>Totals can exceed/under 100 — we normalize during generation.</div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Restrict by Categories</label>
                  <div className={styles.chipRow}>
                    {categories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`${styles.chipToggle} ${generatorCategories.includes(c.id) ? styles.chipToggleOn : ''}`}
                        onClick={() => setGeneratorCategories(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className={styles.helper}>Leave empty to allow all categories.</div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Allowed Pools</label>
                  <div className={styles.chipRow}>
                    {pools.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`${styles.chipToggle} ${generatorPools.includes(p.id) ? styles.chipToggleOn : ''}`}
                        onClick={() => setGeneratorPools(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className={styles.helper}>If none selected, generator can draw from any pool.</div>
                </div>
              </div>

              <div className={styles.generatorGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Include Tags (comma separated)</label>
                  <input className={styles.input} value={generatorTagsInclude} onChange={e => setGeneratorTagsInclude(e.target.value)} placeholder="math, algebra, fundamentals" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Exclude Tags (comma separated)</label>
                  <input className={styles.input} value={generatorTagsExclude} onChange={e => setGeneratorTagsExclude(e.target.value)} placeholder="archived, beta" />
                </div>
              </div>

              <div className={styles.generatorGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Versioning & Randomness</label>
                  <div className={styles.toggleRow}>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorUniquePerCandidate} onChange={e => setGeneratorUniquePerCandidate(e.target.checked)} />
                      Unique paper per candidate
                    </label>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorPreventReuse} onChange={e => setGeneratorPreventReuse(e.target.checked)} />
                      Prevent reusing same question across versions
                    </label>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorShuffleAnswers} onChange={e => setGeneratorShuffleAnswers(e.target.checked)} />
                      Shuffle answers per version
                    </label>
                    <label className={styles.checkItem}>
                      <input type="checkbox" checked={generatorAdaptive} onChange={e => setGeneratorAdaptive(e.target.checked)} />
                      Adaptive (increase difficulty on streaks)
                    </label>
                  </div>
                  <div className={styles.inputRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Versions to pre-generate</label>
                      <input className={styles.input} type="number" min={1} max={20} value={generatorVersionCount} onChange={e => setGeneratorVersionCount(Number(e.target.value))} />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Random Seed (optional)</label>
                      <input className={styles.input} value={generatorRandomSeed} onChange={e => setGeneratorRandomSeed(e.target.value)} placeholder="Leave blank for random" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )

      case 2: return (
        <>
          <h3 className={styles.panelTitle}>Test Settings</h3>
          <div className={styles.inputRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Question Type</label>
              <select className={styles.select} value={examType} onChange={e => setExamType(e.target.value)}>
                <option value="MCQ">Multiple Choice (MCQ)</option>
                <option value="TEXT">Essay / Text</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Page Format</label>
              <select className={styles.select} value={pageFormat} onChange={e => setPageFormat(e.target.value)}>
                <option value="one_per_page">One question per page</option>
                <option value="all_per_page">All questions on one page</option>
                <option value="section_per_page">One section per page</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Calculator</label>
              <select className={styles.select} value={calculatorType} onChange={e => setCalculatorType(e.target.value)}>
                <option value="none">No calculator</option>
                <option value="basic">Basic calculator</option>
                <option value="scientific">Scientific calculator</option>
              </select>
            </div>
          </div>

          <div className={styles.checkboxGroup}>
            {[
              { key: 'hideMetadata', label: 'Hide metadata from candidates', state: hideMetadata, set: setHideMetadata },
              { key: 'randomize_q', label: 'Randomize question order', state: randomizeQuestions, set: setRandomizeQuestions },
              { key: 'randomize_a', label: 'Randomize answer choices', state: randomizeAnswers, set: setRandomizeAnswers },
              { key: 'progress', label: 'Show progress bar', state: showProgressBar, set: setShowProgressBar },
            ].map(item => (
              <label key={item.key} className={styles.checkItem}>
                <input type="checkbox" checked={item.state} onChange={e => item.set(e.target.checked)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className={styles.sectionDivider}>Proctoring</div>
          <div className={styles.presetRow}>
            <button className={styles.btnSecondary} type="button" onClick={() => setProctoring(prev => ({ ...prev, eye_deviation_deg: 15, mouth_open_threshold: 0.4, audio_rms_threshold: 0.1, max_face_absence_sec: 8, max_tab_blurs: 5, max_alerts_before_autosubmit: 8, frame_interval_ms: 4000, audio_chunk_ms: 4000, screenshot_interval_sec: 90 }))}>Lenient</button>
            <button className={styles.btnSecondary} type="button" onClick={() => setProctoring(prev => ({ ...prev, eye_deviation_deg: 12, mouth_open_threshold: 0.35, audio_rms_threshold: 0.08, max_face_absence_sec: 5, max_tab_blurs: 3, max_alerts_before_autosubmit: 5, frame_interval_ms: 3000, audio_chunk_ms: 3000, screenshot_interval_sec: 60 }))}>Standard</button>
            <button className={styles.btnSecondary} type="button" onClick={() => setProctoring(prev => ({ ...prev, eye_deviation_deg: 8, mouth_open_threshold: 0.25, audio_rms_threshold: 0.05, max_face_absence_sec: 3, max_tab_blurs: 1, max_alerts_before_autosubmit: 3, frame_interval_ms: 2000, audio_chunk_ms: 2000, screenshot_interval_sec: 30, screen_capture: true }))}>Strict</button>
          </div>
          <div className={styles.detectorsGrid}>
            {DETECTORS.map(d => (
              <div key={d.key} className={`${styles.detectorCard} ${proctoring[d.key] ? styles.detectorOn : ''}`} onClick={() => toggleDetector(d.key)}>
                <div className={styles.detectorToggle}>
                  <div className={`${styles.toggleTrack} ${proctoring[d.key] ? styles.toggleTrackOn : ''}`}>
                    <div className={styles.toggleThumb} />
                  </div>
                </div>
                <div>
                  <div className={styles.detectorName}>{d.label}</div>
                  <div className={styles.detectorDesc}>{d.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.thresholdGrid}>
            <div>
              <label className={styles.label}>Eye deviation (deg)</label>
              <input className={styles.input} type="number" min={5} max={30} value={proctoring.eye_deviation_deg} onChange={e => setProctoring(p => ({ ...p, eye_deviation_deg: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Mouth open threshold</label>
              <input className={styles.input} type="number" step="0.01" min={0.1} max={1} value={proctoring.mouth_open_threshold} onChange={e => setProctoring(p => ({ ...p, mouth_open_threshold: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Audio RMS threshold</label>
              <input className={styles.input} type="number" step="0.01" min={0.01} max={1} value={proctoring.audio_rms_threshold} onChange={e => setProctoring(p => ({ ...p, audio_rms_threshold: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Max face absence (s)</label>
              <input className={styles.input} type="number" min={1} max={30} value={proctoring.max_face_absence_sec} onChange={e => setProctoring(p => ({ ...p, max_face_absence_sec: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Max tab blurs</label>
              <input className={styles.input} type="number" min={0} max={10} value={proctoring.max_tab_blurs} onChange={e => setProctoring(p => ({ ...p, max_tab_blurs: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Auto-submit after alerts</label>
              <input className={styles.input} type="number" min={1} max={20} value={proctoring.max_alerts_before_autosubmit} onChange={e => setProctoring(p => ({ ...p, max_alerts_before_autosubmit: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Frame interval (ms)</label>
              <input className={styles.input} type="number" min={1000} max={10000} value={proctoring.frame_interval_ms} onChange={e => setProctoring(p => ({ ...p, frame_interval_ms: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Audio chunk (ms)</label>
              <input className={styles.input} type="number" min={1000} max={10000} value={proctoring.audio_chunk_ms} onChange={e => setProctoring(p => ({ ...p, audio_chunk_ms: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={styles.label}>Screenshot interval (s)</label>
              <input className={styles.input} type="number" min={15} max={300} value={proctoring.screenshot_interval_sec} onChange={e => setProctoring(p => ({ ...p, screenshot_interval_sec: Number(e.target.value) }))} />
            </div>
          </div>

          <div className={styles.sectionDivider}>Time Limit</div>
          <label className={styles.checkItem}>
            <input type="checkbox" checked={unlimitedTime} onChange={e => setUnlimitedTime(e.target.checked)} />
            <span>Unlimited time (no timer)</span>
          </label>
          {!unlimitedTime && (
            <div className={styles.formGroup} style={{ marginTop: '0.75rem' }}>
              <label className={styles.label}>Duration (minutes)</label>
              <input name="time_limit" className={styles.input} type="number" min={1} max={600} value={timeLimitMinutes} onChange={e => setTimeLimitMinutes(Number(e.target.value))} style={{ maxWidth: '200px' }} />
            </div>
          )}
        </>
      )

      case 3: return (
        <>
          <h3 className={styles.panelTitle}>Questions</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Add questions directly or seed from a question pool.
          </p>

          {method === 'manual' && examId && (
            <>
              <div className={styles.poolSeed}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>Seed from pool:</span>
                <select className={styles.select} style={{ flex: 1 }} value={selectedPool} onChange={e => setSelectedPool(e.target.value)}>
                  <option value="">Select pool...</option>
                  {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input className={styles.input} type="number" min={1} max={100} value={seedCount} onChange={e => setSeedCount(Number(e.target.value))} style={{ width: '80px' }} />
                <button className={styles.btnSeed} onClick={handleSeedPool} disabled={!selectedPool || !examId || saving}>
                  {saving ? 'Saving...' : 'Seed'}
                </button>
              </div>
              <ExamQuestionPanel examId={examId} questions={questions} onUpdate={setQuestions} questionTypes={QUESTION_TYPES} />
            </>
          )}
          {!examId && (
            <div style={{ padding: '1rem', border: '1px dashed var(--color-border)', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', color: 'var(--color-muted)' }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                {saving ? 'Creating the exam so you can add questions…' : 'Hang tight while we create the exam so you can start adding questions right away.'}
              </div>
              {questionInitError && <div style={{ color: '#f87171', marginBottom: '0.5rem' }}>{questionInitError}</div>}
              {!saving && (
                <button className={styles.btnSeed} onClick={ensureExamCreated}>
                  Retry create
                </button>
              )}
            </div>
          )}
        </>
      )

      case 4: return (
        <>
          <h3 className={styles.panelTitle}>Grading Configuration</h3>
          <div className={styles.inputRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Passing Mark (%)</label>
              <input className={styles.input} type="number" min={0} max={100} value={passingScore} onChange={e => { setPassingScore(Number(e.target.value)); if (examId) autoPersist() }} />
              <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.25rem', display: 'block' }}>
                Achieve more than {passingScore}% on the entire test to pass.
              </span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Max Attempts Allowed</label>
              <input className={styles.input} type="number" min={1} max={99} value={maxAttempts} onChange={e => { setMaxAttempts(Number(e.target.value)); if (examId) autoPersist() }} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Grading Scale</label>
              <select className={styles.select} value={gradingScaleId} onChange={e => { setGradingScaleId(e.target.value); if (examId) autoPersist() }}>
                <option value="">No scale</option>
                {gradingScales.map(gs => <option key={gs.id} value={gs.id}>{gs.name}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.sectionDivider}>Negative Marking</div>
          <label className={styles.checkItem}>
            <input type="checkbox" checked={negativeMarking} onChange={e => { setNegativeMarking(e.target.checked); if (examId) autoPersist() }} />
            <span>Enable negative marking for wrong answers</span>
          </label>
          {negativeMarking && (
            <div className={styles.inputRow} style={{ marginTop: '0.75rem' }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Deduction per Wrong Answer</label>
                <input className={styles.input} type="number" min={0} step={0.25} value={negMarkValue} onChange={e => { setNegMarkValue(Number(e.target.value)); if (examId) autoPersist() }} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Deduction Type</label>
                <select className={styles.select} value={negMarkType} onChange={e => { setNegMarkType(e.target.value); if (examId) autoPersist() }}>
                  <option value="points">Fixed Points</option>
                  <option value="percentage">Percentage of Question</option>
                </select>
              </div>
            </div>
          )}

          <div className={styles.sectionDivider}>Score Display</div>
          <div className={styles.checkboxGroup}>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={showFinalScore} onChange={e => { setShowFinalScore(e.target.checked); if (examId) autoPersist() }} />
              <span>Show final score to candidate after submission</span>
            </label>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={showQuestionScores} onChange={e => { setShowQuestionScores(e.target.checked); if (examId) autoPersist() }} />
              <span>Show per-question score breakdown</span>
            </label>
            </div>

          <div className={styles.conductGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Exam conduct controls</label>
              <div className={styles.toggleRow}>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.fullscreen_enforce} onChange={e => setProctoring(p => ({ ...p, fullscreen_enforce: e.target.checked }))} />
                  Enforce fullscreen
                </label>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.tab_switch_detect} onChange={e => setProctoring(p => ({ ...p, tab_switch_detect: e.target.checked }))} />
                  Detect tab switches
                </label>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.screen_capture} onChange={e => setProctoring(p => ({ ...p, screen_capture: e.target.checked }))} />
                  Capture screen periodically
                </label>
                <label className={styles.checkItem}>
                  <input type="checkbox" checked={proctoring.copy_paste_block} onChange={e => setProctoring(p => ({ ...p, copy_paste_block: e.target.checked }))} />
                  Block copy / paste
                </label>
              </div>
              <div className={styles.helper}>These map to runtime enforcement: fullscreen prompts, visibility/tab pings, optional screen grabs, and clipboard locking.</div>
            </div>
          </div>
        </>
      )

      case 5: return (
        <>
          <h3 className={styles.panelTitle}>Certificates</h3>
          <label className={styles.checkItem} style={{ marginBottom: '1rem' }}>
            <div
              className={`${styles.toggleTrack} ${certEnabled ? styles.toggleTrackOn : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => { setCertEnabled(v => !v); if (examId) autoPersist() }}
            >
              <div className={styles.toggleThumb} />
            </div>
            <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>Issue certificate upon passing</span>
          </label>
          {certEnabled && (
            <>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Template</label>
                  <select className={styles.select} value={certTemplate} onChange={e => { setCertTemplate(e.target.value); if (examId) autoPersist() }}>
                    {CERTIFICATE_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Orientation</label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
                    {['landscape', 'portrait'].map(o => (
                      <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--color-text)' }}>
                        <input type="radio" checked={certOrientation === o} onChange={() => { setCertOrientation(o); if (examId) autoPersist() }} />
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Certificate Title</label>
                  <input className={styles.input} value={certTitle} onChange={e => { setCertTitle(e.target.value); if (examId) autoPersist() }} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Subtitle</label>
                  <input className={styles.input} value={certSubtitle} onChange={e => { setCertSubtitle(e.target.value); if (examId) autoPersist() }} placeholder="e.g. with Distinction" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Company / Institution Name</label>
                <input className={styles.input} value={certCompany} onChange={e => { setCertCompany(e.target.value); if (examId) autoPersist() }} placeholder="e.g. SYRA Learning Institute" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Certificate Body Text</label>
                <textarea className={styles.textarea} rows={3} value={certDescription} onChange={e => { setCertDescription(e.target.value); if (examId) autoPersist() }} />
              </div>
              <div className={styles.certPreview}>
                <div className={styles.certPreviewLabel}>{certTemplate} — {certOrientation}</div>
                <div className={styles.certPreviewBox} style={{ aspectRatio: certOrientation === 'landscape' ? '4/3' : '3/4' }}>
                  <div className={styles.certPreviewTitle}>{certTitle || 'Certificate Title'}</div>
                  {certSubtitle && <div className={styles.certPreviewSub}>{certSubtitle}</div>}
                  {certCompany && <div className={styles.certPreviewCompany}>{certCompany}</div>}
                </div>
              </div>
            </>
          )}
        </>
      )

      case 6: return (
        <>
          <h3 className={styles.panelTitle}>Review</h3>
          {[
            ['Test Title', title || '—'],
            ['Description', description || 'None'],
            ['Category', categories.find(c => c.id === categoryId)?.name || 'None'],
            ['Creation Method', method === 'manual' ? 'Manual Selection' : `Generator (${generatorBy})`],
            ...(method === 'generator' ? [
              ['Generator: Total Questions', generatorCount],
              ['Generator: Difficulty Mix', `${generatorDifficultyMix.easy}% / ${generatorDifficultyMix.medium}% / ${generatorDifficultyMix.hard}%`],
              ['Generator: Categories', generatorCategories.length ? generatorCategories.length : 'All'],
              ['Generator: Pools', generatorPools.length ? generatorPools.length : 'All'],
              ['Generator: Tags Include', generatorTagsInclude || 'None'],
              ['Generator: Tags Exclude', generatorTagsExclude || 'None'],
            ] : []),
      ['Question Type', examType],
            ['Page Format', pageFormat],
            ['Calculator', calculatorType],
            ['Time Limit', unlimitedTime ? 'Unlimited' : `${timeLimitMinutes} minutes`],
            ['Randomize Questions', randomizeQuestions ? 'Yes' : 'No'],
            ['Passing Score', `${passingScore}%`],
            ['Max Attempts', maxAttempts],
            ['Grading Scale', gradingScales.find(g => g.id === gradingScaleId)?.name || 'None'],
            ['Negative Marking', negativeMarking ? `Yes (${negMarkValue} ${negMarkType})` : 'No'],
            ['Questions', `${questions.length} question(s)` + (questions.length === 0 ? ' — add at least one' : '')],
            ['Certificate', certEnabled ? `${certTemplate} (${certOrientation})` : 'Disabled'],
            ['Proctoring', Object.entries(proctoring).filter(([,v]) => v).map(([k]) => k).join(', ') || 'None'],
            ['Sessions Assigned', `${assignedSessions.length} session(s)`],
          ].map(([label, value]) => (
            <div key={label} className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{label}</span>
              <span className={styles.reviewValue}>{String(value)}</span>
            </div>
          ))}
        </>
      )

      case 7: return (
        <>
          <h3 className={styles.panelTitle}>Testing Sessions</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Assign this test to learners with a scheduled date and time.
          </p>
          {!examId ? (
            <p style={{ color: 'var(--color-muted)' }}>Save the test first (go back and advance through steps).</p>
          ) : (
            <>
              <div className={styles.inputRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Access Mode</label>
                  <select className={styles.select} value={accessMode} onChange={e => setAccessMode(e.target.value)}>
                    <option value="OPEN">Open (anytime)</option>
                    <option value="RESTRICTED">Restricted (by schedule)</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Scheduled Date & Time</label>
                  <input className={styles.input} type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                </div>
              </div>

              <label className={styles.label} style={{ marginTop: '0.75rem' }}>Select Learners</label>
              <input className={styles.userSearch} placeholder="Search learners..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <div className={styles.userList}>
                {filteredUsers.map(u => (
                  <label key={u.id} className={styles.userItem}>
                    <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    <span>{u.user_id} — {u.name || u.email || 'Learner'}</span>
                  </label>
                ))}
                {filteredUsers.length === 0 && <div className={styles.userItem} style={{ color: 'var(--color-muted)' }}>No learners found.</div>}
              </div>
              <button className={styles.btnSeed} onClick={handleAssignSessions} disabled={selectedUsers.length === 0}>
                Assign {selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''}
              </button>

              {assignedSessions.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div className={styles.label} style={{ marginBottom: '0.5rem' }}>Assigned Sessions</div>
                  {assignedSessions.map((s, i) => (
                    <div key={i} style={{ padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', marginBottom: '0.3rem', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                      {s.user} — {s.mode} {s.at ? `@ ${new Date(s.at).toLocaleString()}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )

      case 8: return (
        <>
          <h3 className={styles.panelTitle}>Save Test</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Choose the initial status for this test. You can change it later from the Manage Tests page.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span className={styles.chip}>Questions: {questions.length}</span>
            <span className={styles.chip}>Seed Pools: {selectedPool ? 1 : 0}</span>
            <span className={styles.chip}>Scheduled: {assignedSessions.length}</span>
            <span className={styles.chip}>Status: {publishStatus === 'OPEN' ? 'Published' : 'Draft'}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Publication Status</label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.75rem 1rem', border: `1px solid ${publishStatus === 'CLOSED' ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: '8px', flex: 1, background: publishStatus === 'CLOSED' ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                <input type="radio" checked={publishStatus === 'CLOSED'} onChange={() => { setPublishStatus('CLOSED'); if (examId) autoPersist() }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--color-text)' }}>Draft</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Not visible to candidates</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.75rem 1rem', border: `1px solid ${publishStatus === 'OPEN' ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: '8px', flex: 1, background: publishStatus === 'OPEN' ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                <input type="radio" checked={publishStatus === 'OPEN'} onChange={() => { setPublishStatus('OPEN'); if (examId) autoPersist() }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--color-text)' }}>Published</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Visible and active for candidates</div>
                </div>
              </label>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            <strong style={{ color: 'var(--color-text)' }}>Summary:</strong> "{title || 'Unnamed Test'}" with {questions.length} questions, {assignedSessions.length} sessions assigned.
          </div>
        </>
      )

      default: return null
    }
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{editId ? 'Edit Test' : 'New Test Wizard'}</h2>

      {/* Steps bar */}
      <div className={styles.stepsBar}>
        {STEPS.map(s => (
          <div
            key={s.id}
            className={`${styles.step} ${s.id === step ? styles.stepActive : ''} ${s.id < step ? styles.stepCompleted : ''}`}
            onClick={() => s.id <= step && setStep(s.id)}
          >
            <span className={`${styles.stepNum} ${s.id === step ? styles.stepNumActive : ''} ${s.id < step ? styles.stepNumCompleted : ''}`}>
              {s.id < step ? '✓' : s.id + 1}
            </span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Panel */}
      <div className={`${styles.panel} glass`}>
        {panelError && <div className={styles.errorBanner}>{panelError}</div>}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.btnBack} onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className={styles.btnNext} onClick={handleNext} disabled={(step === 0 && !title.trim()) || (step >= 3 && questions.length === 0) || saving}>
            {saving ? 'Saving...' : 'Next →'}
          </button>
        ) : (
          <button className={styles.btnPublish} onClick={handlePublish} disabled={saving || questions.length === 0}>
            {saving ? 'Saving...' : publishStatus === 'OPEN' ? '🚀 Publish Test' : '💾 Save as Draft'}
          </button>
        )}
      </div>
    </div>
  )
}
