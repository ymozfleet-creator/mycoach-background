require('dotenv').config();
const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors    = require('cors');
const app     = express();

app.use(cors({ origin: '*' }));

app.post('/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send('Webhook Error: ' + err.message);
    }
    if (event.type === 'checkout.session.completed') {
      console.log('決済完了:', event.data.object.metadata);
    }
    res.json({ received: true });
  }
);

app.use(express.json());

app.post('/create-tuition-session', async (req, res) => {
  const { amount, teamName, playerName, playerId, teamId, month } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: '金額が不正です' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: '月謝 ' + month + ' — ' + teamName },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: process.env.APP_URL + '/?payment=success&session_id={CHECKOUT_SESSION_ID}&type=tuition',
      cancel_url:  process.env.APP_URL + '/?payment=cancel',
      metadata: { type: 'monthly_fee', payerId: playerId, teamId, month },
    });
    res.json({ sessionUrl: session.url });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/create-coach-payment-session', async (req, res) => {
  const { amount, coachName, teamName, coachId, teamId, month, threadId } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: '金額が不正です' });
  const platformFee = Math.round(amount * 0.1);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: '指導料 ' + month + ' — ' + coachName },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: process.env.APP_URL + '/?payment=success&session_id={CHECKOUT_SESSION_ID}&threadId=' + threadId,
      cancel_url:  process.env.APP_URL + '/?payment=cancel&threadId=' + threadId,
      metadata: { type: 'coach_fee', coachId, teamId, threadId, month, originalAmount: String(amount), platformFee: String(platformFee) },
    });
    res.json({ sessionUrl: session.url });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/create-connect-account', async (req, res) => {
  const { userId, email, name } = req.body;
  try {
    const account = await stripe.accounts.create({
      type: 'express', country: 'JP', email,
      capabilities: { transfers: { requested: true } },
    });
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: process.env.APP_URL + '/?connect=refresh',
      return_url:  process.env.APP_URL + '/?connect=complete',
      type: 'account_onboarding',
    });
    console.log('Connect Account作成:', userId, account.id);
    res.json({ url: accountLink.url });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/session-status/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({ status: session.payment_status, metadata: session.metadata });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('✅ サーバー起動: port ' + PORT));
