/**
 * Survey Monkey Setup Script
 * 
 * This script helps you:
 * 1. Create a survey with the required questions
 * 2. Get all the IDs you need for configuration
 * 3. Set up collectors
 * 
 * Usage:
 *   node scripts/setup-surveymonkey.js
 * 
 * Make sure to set SURVEYMONKEY_ACCESS_TOKEN in your .env file first
 */

import axios from 'axios';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const API_BASE = 'https://api.surveymonkey.com/v3';
const ACCESS_TOKEN = process.env.SURVEYMONKEY_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('❌ SURVEYMONKEY_ACCESS_TOKEN not found in .env file');
  console.error('   Please set it first: SURVEYMONKEY_ACCESS_TOKEN=your_token');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ API Error: ${error.response?.data?.error?.message || error.message}`);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function listSurveys() {
  try {
    const data = await apiCall('GET', '/surveys');
    return data.data || [];
  } catch (error) {
    return [];
  }
}

async function createSurvey() {
  console.log('\n📝 Creating survey...');
  
  const surveyData = {
    title: 'AI Teaching Effectiveness',
    nickname: 'AI Feedback Survey'
  };
  
  const survey = await apiCall('POST', '/surveys', surveyData);
  console.log(`✅ Survey created: ${survey.id}`);
  return survey;
}

async function createPage(surveyId) {
  console.log('\n📄 Creating page...');
  
  const pageData = {
    title: 'Feedback Questions',
    description: 'Please rate your experience'
  };
  
  const page = await apiCall('POST', `/surveys/${surveyId}/pages`, pageData);
  console.log(`✅ Page created: ${page.id}`);
  return page;
}

async function createQuestion(surveyId, pageId, questionConfig) {
  console.log(`\n❓ Creating question: ${questionConfig.heading}...`);
  
  // Use single_choice format - API expects 'headings' array and 'subtype' not 'subfamily'
  const questionData = {
    family: 'single_choice',
    subtype: 'vertical',
    headings: [
      {
        heading: questionConfig.heading
      }
    ],
    answers: {
      choices: questionConfig.choices.map((label, index) => ({
        text: label,
        position: index + 1
      }))
    }
  };
  
  const question = await apiCall('POST', `/surveys/${surveyId}/pages/${pageId}/questions`, questionData);
  console.log(`✅ Question created: ${question.id}`);
  return question;
}

async function createCollector(surveyId) {
  console.log('\n🔗 Creating web link collector...');
  
  const collectorData = {
    type: 'weblink',
    name: 'API Feedback Collector'
  };
  
  const collector = await apiCall('POST', `/surveys/${surveyId}/collectors`, collectorData);
  console.log(`✅ Collector created: ${collector.id}`);
  return collector;
}

async function getQuestionDetails(surveyId, pageId, questionId) {
  const question = await apiCall('GET', `/surveys/${surveyId}/pages/${pageId}/questions/${questionId}`);
  return question;
}

async function main() {
  console.log('🚀 Survey Monkey Setup Script\n');
  console.log('This script will help you set up your survey and get all required IDs.\n');
  
  // List existing surveys
  console.log('📋 Fetching existing surveys...');
  const surveys = await listSurveys();
  
  if (surveys.length > 0) {
    console.log(`\nFound ${surveys.length} existing survey(s):`);
    surveys.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title} (ID: ${s.id})`);
    });
    
    const useExisting = await question('\nUse existing survey? (y/n): ');
    if (useExisting.toLowerCase() === 'y') {
      const surveyNum = await question('Enter survey number: ');
      const selectedSurvey = surveys[parseInt(surveyNum) - 1];
      if (selectedSurvey) {
        console.log(`\n✅ Using survey: ${selectedSurvey.title} (${selectedSurvey.id})`);
        await configureExistingSurvey(selectedSurvey.id);
        rl.close();
        return;
      }
    }
  }
  
  // Create new survey
  const createNew = await question('\nCreate new survey? (y/n): ');
  if (createNew.toLowerCase() !== 'y') {
    console.log('Exiting...');
    rl.close();
    return;
  }
  
  try {
    // Step 1: Create survey
    const survey = await createSurvey();
    const surveyId = survey.id;
    
    // Step 2: Create page
    const page = await createPage(surveyId);
    const pageId = page.id;
    
    // Step 3: Create questions (using single choice for 1-5 scale)
    const questions = [
      {
        heading: 'How clear was the content?',
        choices: ['1 - Very Unclear', '2 - Unclear', '3 - Neutral', '4 - Clear', '5 - Very Clear']
      },
      {
        heading: 'How engaged were you?',
        choices: ['1 - Not Engaged', '2 - Slightly Engaged', '3 - Neutral', '4 - Engaged', '5 - Very Engaged']
      },
      {
        heading: 'How stable was your breathing?',
        choices: ['1 - Very Unstable', '2 - Unstable', '3 - Neutral', '4 - Stable', '5 - Very Stable']
      },
      {
        heading: 'How well did you maintain focus?',
        choices: ['1 - Poor Focus', '2 - Below Average', '3 - Average', '4 - Good Focus', '5 - Excellent Focus']
      }
    ];
    
    const createdQuestions = [];
    for (const qConfig of questions) {
      const question = await createQuestion(surveyId, pageId, qConfig);
      createdQuestions.push({
        config: qConfig,
        id: question.id
      });
    }
    
    // Step 4: Get question details (to get choice IDs)
    console.log('\n📊 Fetching question details...');
    const questionDetails = [];
    for (const q of createdQuestions) {
      const details = await getQuestionDetails(surveyId, pageId, q.id);
      questionDetails.push({
        heading: q.config.heading,
        questionId: q.id,
        choices: details.answers?.choices || []
      });
    }
    
    // Step 5: Create collector
    const collector = await createCollector(surveyId);
    
    // Step 6: Display configuration
    console.log('\n' + '='.repeat(60));
    console.log('✅ SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n📋 Add these to your .env file:\n');
    
    console.log(`SURVEYMONKEY_SURVEY_ID=${surveyId}`);
    console.log(`SURVEYMONKEY_COLLECTOR_ID=${collector.id}`);
    console.log(`SURVEYMONKEY_PAGE_ID=${pageId}`);
    console.log('');
    
    // Map questions to IDs (match by heading prefix)
    const questionMap = {
      'How clear was the content?': 'CLARITY',
      'How engaged were you?': 'ENGAGEMENT',
      'How stable was your breathing?': 'BREATHING',
      'How well did you maintain focus?': 'GAZE'
    };
    
    // Helper to match question by heading prefix
    function getQuestionKey(heading) {
      for (const [key, value] of Object.entries(questionMap)) {
        if (heading.includes(key)) {
          return value;
        }
      }
      return null;
    }
    
    questionDetails.forEach((q, index) => {
      const key = getQuestionKey(q.heading) || `QUESTION_${index + 1}`;
      console.log(`SURVEYMONKEY_${key}_QUESTION_ID=${q.questionId}`);
      
      if (q.choices.length > 0) {
        // Sort choices by position to ensure correct order (1-5)
        const sortedChoices = q.choices.sort((a, b) => (a.position || 0) - (b.position || 0));
        const choiceIds = sortedChoices.map(c => c.id).join(',');
        console.log(`SURVEYMONKEY_${key}_CHOICES=${choiceIds}`);
      }
      console.log('');
    });
    
    console.log('='.repeat(60));
    console.log('\n💡 Next steps:');
    console.log('1. Copy the above configuration to your .env file');
    console.log('2. Restart your server');
    console.log('3. Test by completing a session');
    console.log(`4. View your survey: https://www.surveymonkey.com/r/${collector.id}`);
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
  }
  
  rl.close();
}

async function configureExistingSurvey(surveyId) {
  console.log('\n📊 Fetching survey details...');
  
  try {
    // Get pages
    const pagesData = await apiCall('GET', `/surveys/${surveyId}/pages`);
    const pages = pagesData.data || [];
    
    if (pages.length === 0) {
      console.log('❌ No pages found in survey. Please add questions first.');
      return;
    }
    
    const pageId = pages[0].id;
    console.log(`✅ Using page: ${pageId}`);
    
    // Get questions
    const questionsData = await apiCall('GET', `/surveys/${surveyId}/pages/${pageId}/questions`);
    const questions = questionsData.data || [];
    
    console.log(`\n📋 Found ${questions.length} question(s):`);
    questions.forEach((q, i) => {
      console.log(`  ${i + 1}. ${q.heading} (ID: ${q.id})`);
    });
    
    // Get collectors
    const collectorsData = await apiCall('GET', `/surveys/${surveyId}/collectors`);
    const collectors = collectorsData.data || [];
    
    if (collectors.length === 0) {
      console.log('\n⚠️  No collectors found. Creating one...');
      const collector = await createCollector(surveyId);
      console.log(`✅ Collector created: ${collector.id}`);
    } else {
      console.log(`\n🔗 Found ${collectors.length} collector(s):`);
      collectors.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name || c.type} (ID: ${c.id})`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Configuration for .env file:\n');
    console.log(`SURVEYMONKEY_SURVEY_ID=${surveyId}`);
    console.log(`SURVEYMONKEY_PAGE_ID=${pageId}`);
    if (collectors.length > 0) {
      console.log(`SURVEYMONKEY_COLLECTOR_ID=${collectors[0].id}`);
    }
    console.log('\n⚠️  You need to manually map question IDs to:');
    console.log('   - SURVEYMONKEY_CLARITY_QUESTION_ID');
    console.log('   - SURVEYMONKEY_ENGAGEMENT_QUESTION_ID');
    console.log('   - SURVEYMONKEY_BREATHING_QUESTION_ID');
    console.log('   - SURVEYMONKEY_GAZE_QUESTION_ID');
    console.log('\n💡 Use the question list above to match them.');
    
  } catch (error) {
    console.error('❌ Error configuring survey:', error.message);
  }
}

main().catch(console.error);

