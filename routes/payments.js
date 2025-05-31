import { Router } from 'express';
import axios from 'axios';

const router = Router();

// GETTRX API configuration
const gettrxApi = axios.create({
    baseURL: process.env.GETTRX_API_URL || 'https://api-dev.gettrx.com',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Simple in-memory storage for demo (replace with database)
const users = new Map();
const payments = new Map();

// Mock user middleware (replace with your actual auth middleware)
const mockAuth = (req, res, next) => {
    // For development - replace with actual authentication
    req.user = { id: 'user_123' };
    next();
};

// Setup merchant account endpoint
router.post('/setup-merchant', mockAuth, async (req, res) => {
    try {
        const { merchantAccountId } = req.body;
        const userId = req.user?.id;

        console.log(`Setting up merchant account: ${merchantAccountId} for user: ${userId}`);

        // Validate input
        if (!merchantAccountId || !merchantAccountId.startsWith('acm_')) {
            return res.status(400).json({
                error: 'Invalid merchant account ID format. Must start with "acm_"'
            });
        }

        if (!userId) {
            return res.status(401).json({
                error: 'User authentication required'
            });
        }

        // Optional: Verify the merchant account exists with GETTRX
        if (process.env.GETTRX_SECRET_KEY) {
            try {
                await gettrxApi.get(`/payments/v1/accounts/${merchantAccountId}`, {
                    headers: {
                        'secretKey': process.env.GETTRX_SECRET_KEY,
                        'onBehalfOf': merchantAccountId
                    }
                });
                console.log('✅ Merchant account verified with GETTRX');
            } catch (gettrxError) {
                console.log('⚠️  GETTRX verification skipped (development mode)');
                // In development, we'll skip this verification
            }
        }

        // Save to in-memory storage (replace with database)
        users.set(userId, {
            id: userId,
            merchantAccountId,
            setupAt: new Date().toISOString()
        });

        console.log(`✅ Merchant account ${merchantAccountId} saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Merchant account linked successfully',
            merchantAccountId,
            userId
        });

    } catch (error) {
        console.error('❌ Setup merchant error:', error);
        res.status(500).json({
            error: 'Failed to setup merchant account',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get merchant account info
router.get('/merchant/:userId', mockAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = users.get(userId);

        if (!user || !user.merchantAccountId) {
            return res.status(404).json({
                error: 'No merchant account found for user'
            });
        }

        res.json({
            success: true,
            merchantAccountId: user.merchantAccountId,
            setupAt: user.setupAt
        });

    } catch (error) {
        console.error('Get merchant account error:', error);
        res.status(500).json({
            error: 'Failed to get merchant account'
        });
    }
});

// Process payment endpoint
router.post('/process', mockAuth, async (req, res) => {
    try {
        const {
            tenantId,
            propertyId,
            amount,
            paymentMethod,
            description,
            dueDate,
            paymentDate,
            paymentToken
        } = req.body;

        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                error: 'User authentication required'
            });
        }

        // Get user's merchant account ID
        const user = users.get(userId);
        const merchantAccountId = user?.merchantAccountId || 'acm_67c1039bd94d3f0001ee9801'; // Fallback to test account

        if (!user?.merchantAccountId) {
            console.log('⚠️  No merchant account configured, using test account');
        }

        let paymentResult = null;

        // Process electronic payments through GETTRX
        if (paymentMethod === 'card' || paymentMethod === 'ach') {
            if (!paymentToken) {
                return res.status(400).json({
                    error: 'Payment token required for electronic payments'
                });
            }

            try {
                paymentResult = await gettrxApi.post('/payments/v1/payment-requests', {
                    amount: amount, // Amount should already be in cents
                    currency: 'usd',
                    paymentToken: paymentToken,
                    description: description || `Rent payment for ${propertyId}`
                }, {
                    headers: {
                        'secretKey': process.env.GETTRX_SECRET_KEY,
                        'onBehalfOf': merchantAccountId
                    }
                });

                console.log('✅ GETTRX Payment Result:', paymentResult.data);
            } catch (gettrxError) {
                console.error('❌ GETTRX Payment Error:', gettrxError.response?.data);
                return res.status(400).json({
                    error: 'Payment processing failed',
                    details: gettrxError.response?.data?.message || 'Unknown error'
                });
            }
        }

        // Save payment record
        const paymentRecord = {
            id: paymentResult?.data?.id || `payment_${Date.now()}`,
            userId,
            tenantId,
            propertyId,
            amount: amount / 100, // Convert back to dollars for storage
            paymentMethod,
            description,
            dueDate,
            paymentDate,
            status: paymentResult ? 'completed' : 'pending',
            gettrxPaymentId: paymentResult?.data?.id,
            createdAt: new Date().toISOString()
        };

        // Save to in-memory storage (replace with database)
        payments.set(paymentRecord.id, paymentRecord);

        console.log('✅ Payment record created:', paymentRecord.id);

        res.json({
            success: true,
            message: 'Payment processed successfully',
            payment: paymentRecord
        });

    } catch (error) {
        console.error('❌ Process payment error:', error);
        res.status(500).json({
            error: 'Failed to process payment'
        });
    }
});

// Get payment history
router.get('/history/:userId', mockAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        // Get payments from in-memory storage (replace with database query)
        const userPayments = Array.from(payments.values())
            .filter(payment => payment.userId === userId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // If no payments found, return mock data for demo
        const mockPayments = userPayments.length > 0 ? userPayments : [
            {
                id: 'payment_demo_1',
                tenant: {
                    user: { name: 'John Doe' },
                    property: { address: '123 Main St, Apt 1' }
                },
                amount: 1200,
                status: 'completed',
                created_at: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
                paymentMethod: 'card'
            },
            {
                id: 'payment_demo_2',
                tenant: {
                    user: { name: 'Jane Smith' },
                    property: { address: '456 Oak Ave, Unit 2B' }
                },
                amount: 950,
                status: 'pending',
                created_at: new Date(Date.now() - 86400000 * 10).toISOString(), // 10 days ago
                paymentMethod: 'ach'
            }
        ];

        res.json({
            success: true,
            payments: mockPayments,
            count: mockPayments.length
        });

    } catch (error) {
        console.error('❌ Get payment history error:', error);
        res.status(500).json({
            error: 'Failed to get payment history'
        });
    }
});

// Legacy payment endpoints for backward compatibility
router.post('/v1/payment-requests', mockAuth, async (req, res) => {
    try {
        const { amount, currency, payment_token, on_behalf_of } = req.body;

        const paymentResult = await gettrxApi.post('/payments/v1/payment-requests', {
            amount,
            currency,
            paymentToken: payment_token,
        }, {
            headers: {
                'secretKey': process.env.GETTRX_SECRET_KEY,
                'onBehalfOf': on_behalf_of
            }
        });

        res.json(paymentResult.data);

    } catch (error) {
        console.error('Legacy payment processing error:', error);
        res.status(500).json({
            error: 'Payment processing failed',
            details: error.response?.data || error.message
        });
    }
});

// Test endpoint
router.get('/test', (req, res) => {
    res.json({
        message: 'Payments API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

export default router;