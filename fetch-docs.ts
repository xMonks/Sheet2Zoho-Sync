import axios from 'axios';
axios.get('https://www.zoho.com/crm/developer/docs/api/v3/get-records.html')
  .then(res => console.log(res.data.match(/Authorization.*?(?=<)/g)))
  .catch(console.error);
