const Validator = require("co2certificate-validator");
const certificate = '0x971032fdCD88E71A880b539DEc415D1e48441DAF';
const app = async function() {
	let instance = new Validator();
  const validationResult = await instance.validation(certificate);
	console.log('Is Valid?', validationResult);
}
app();
