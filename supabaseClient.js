// supabaseClient.js
// Initialize Supabase client for use in the app

// Replace with your actual Supabase project URL and anon/public key
const SUPABASE_URL = 'https://myjprzpkpoesakmgholh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15anByenBrcG9lc2FrbWdob2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMDIxMzQsImV4cCI6MjA3MTc3ODEzNH0.LF-Mxmej900inPZ27fA0WOjLk-YlxWGwGlrp8tPeLfE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other scripts
window.supabaseClient = supabase;
