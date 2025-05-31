import { Router } from 'express';

const router = Router();

// Mock user middleware (replace with your actual auth middleware)
const mockAuth = (req, res, next) => {
    // For development - replace with actual authentication
    req.user = { id: 'user_123' };
    next();
};

// Test endpoint
router.get('/test', (req, res) => {
    res.json({
        message: 'Merchants API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Legacy merchant account endpoint - change from '/' to '/setup'
router.post('/setup', mockAuth, async (req, res) => {
    try {
        const { accountId } = req.body;
        const userId = req.user && req.user.id;

        if (!userId) {
            return res.status(401).json({
                error: 'User authentication required'
            });
        }

        // TODO: Save to your database
        console.log(`Saving merchant account ${accountId} for user ${userId}`);

        res.json({
            success: true,
            message: 'Merchant account saved successfully',
            accountId
        });

    } catch (error) {
        console.error('Save merchant account error:', error);
        res.status(500).json({
            error: 'Failed to save merchant account'
        });
    }
});

export default router;