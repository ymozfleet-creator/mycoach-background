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
      console.log('payment completed:', event.data.object.metadata);
    }
    res.json({ received: true });
  }
);

app.use(express.json());

app.post('/create-tuition-session', async (req, res) => {
  const { amount, teamName, playerName, playerId, teamId, month } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: 'invalid amount' });
  const appUrl = process.env.APP_URL || 'https://mycoach-background-production.up.railway.app';
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: 'Monthly fee ' + month + ' - ' + teamName },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: appUrl + '/?payment=success&session_id={CHECKOUT_SESSION_ID}&type=tuition',
      cancel_url:  appUrl + '/?payment=cancel',
      metadata: { type: 'monthly_fee', payerId: playerId, teamId: teamId, month: month },
    });
    res.json({ sessionUrl: session.url });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/create-coach-payment-session', async (req, res) => {
  const { amount, coachName, teamName, coachId, teamId, month, threadId } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: 'invalid amount' });
  const appUrl = process.env.APP_URL || 'https://mycoach-background-production.up.railway.app';
  const platformFee = Math.round(amount * 0.1);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: 'Coach fee ' + month + ' - ' + coachName },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: appUrl + '/?payment=success&session_id={CHECKOUT_SESSION_ID}&threadId=' + threadId,
      cancel_url:  appUrl + '/?payment=cancel&threadId=' + threadId,
      metadata: { type: 'coach_fee', coachId: coachId, teamId: teamId, threadId: threadId, month: month, originalAmount: String(amount), platformFee: String(platformFee) },
    });
    res.json({ sessionUrl: session.url });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/create-connect-account', async (req, res) => {
  const { userId, email, name } = req.body;
  const appUrl = process.env.APP_URL || 'https://mycoach-background-production.up.railway.app';
  try {
    const account = await stripe.accounts.create({
      type: 'express', country: 'JP', email: email,
      capabilities: { transfers: { requested: true } },
    });
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: appUrl + '/?connect=refresh',
      return_url:  appUrl + '/?connect=complete',
      type: 'account_onboarding',
    });
    console.log('Connect Account:', userId, account.id);
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
app.listen(PORT, () => console.log('server started: port ' + PORT));
