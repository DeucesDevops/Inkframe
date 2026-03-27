import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as projectController from '../controllers/projects.js'

const router = Router()
router.use(requireAuth)

// List all projects for the user
router.get('/', projectController.listProjects)

// Create new project
router.post('/', projectController.createProject)

// Get single project with full context
router.get('/:id', projectController.getProject)

// Update project (title, context fields, checkpoints)
router.patch('/:id', projectController.updateProject)

// Delete project
router.delete('/:id', projectController.deleteProject)

// Chapter routes
router.get('/:id/chapters', projectController.listChapters)

router.patch('/:id/chapters/:chapterNum', projectController.updateChapter)

export { router as projectRouter }
