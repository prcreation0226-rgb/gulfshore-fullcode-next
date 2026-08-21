const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function testOpenAI() {
  try {
    console.log("Testing OpenAI...");
    const response = await openai.createChatCompletion({
      model: "gpt-4o-mini", // Use gpt-3.5-turbo if 4o-mini is not available
      messages: [{ role: "user", content: "Say hello!" }],
    });
    console.log("Success:", response.data.choices[0].message.content);
  } catch (error) {
    if (error.response) {
      console.error("OpenAI Error:", error.response.status, error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
}

testOpenAI();
