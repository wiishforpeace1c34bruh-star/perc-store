import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@11.1.0?target=deno"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

// Use the service role key to bypass RLS so the webhook can update the profile
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')

  // First step is to verify the event came from Stripe
  let event
  try {
    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret!)
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return new Response(err.message, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.client_reference_id

      if (userId) {
        // Upgrade the user's account in the database!
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ has_access: true })
          .eq('id', userId)

        if (error) throw error
        
        console.log(`Successfully upgraded user ${userId}`)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
