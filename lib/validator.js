'use strict';

const validator = function() {

  let parent = this;

  this._throttle = function(ms) {
    console.log('Throrrle',ms);
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  this._storage = async function() {
    if((typeof parent._storage_initialized == 'undefined')||(typeof parent._storage_instance == 'undefined')) {
      const storage = require('node-persist');
      await storage.init();
      parent._storage_initialized = new Date().getTime();
      parent._storage_instance = storage;
    }
    return parent._storage_instance;
  }

  this._fetch = async function(certificateId) {
    const axios = require("axios");
    if((typeof parent._fetch_last !== 'undefined') && (parent._fetch_last > new Date().getTime()-1000)) {
      await this._throttle(Math.abs(new Date().getTime() - (parent._fetch_last+1000)));
    }
    parent._fetch_last = new Date().getTime();

    const responds = await axios.get("https://api.corrently.io/v2.0/co2/compensation?compensation="+certificateId);
    return responds.data;
  }
  this._fetchRoot = async function(rootId) {
    const axios = require("axios");
    if((typeof parent._fetch_last !== 'undefined') && (parent._fetch_last > new Date().getTime()-1000)) {
      await this._throttle(Math.abs(new Date().getTime() - (parent._fetch_last+1000)));
    }
    parent._fetch_last = new Date().getTime();

    const responds = await axios.get("https://api.corrently.io/v2.0/co2/tree?tree="+rootId);
    return responds.data;
  }

  /** Returns true/false after inner consistency check of a certificate */
  this._innerValidation = async function(certificate) {
      let result = true;
      if(typeof certificate.compensation == 'undefined') result = false;
      if((result) && (certificate.compensation.length !== 42)) result = false;
      if((result) && (typeof certificate.certificate == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.tree == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.issueDate == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.treecompensation == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.treecompensation.cnt == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.treecompensation.nonce == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.treecompensation.availLifetime == 'undefined')) result = false;
      if((result) && (typeof certificate.certificate.treecompensation.usedLifetime == 'undefined')) result = false;
      if((result) && (typeof certificate.nonce == 'undefined')) result = false;
      if((result) && (certificate.certificate.issueDate > new Date().getTime())) result = false;
      if((result) && (certificate.nonce !== certificate.certificate.treecompensation.nonce)) result = false;
      if((result) && (typeof certificate.seq == 'undefined')) result = false;
      return result;
  }

  this._chainValidation = async function(certificate) {
    let result = true;
    if(certificate.certificate.tree !== certificate.nonce) {
        let sibling = await parent.getCertificate(certificate.nonce);
        if((result) && (typeof sibling.certificate == 'undefined')) result = false;
        if((result) && (sibling.certificate.tree !== certificate.certificate.tree)) result = false;
        if((result) && (sibling.seq !== certificate.seq - 1)) result = false;
        if((result) && (sibling.certificate.treecompensation.cnt !== certificate.certificate.treecompensation.cnt - 1)) result = false;
        if((result) && (sibling.certificate.treecompensation.cnt !== certificate.certificate.treecompensation.cnt - 1)) result = false;
        if((result) && (sibling.certificate.treecompensation.availLifetime - sibling.co2 !== certificate.certificate.treecompensation.availLifetime)) result = false;
        if((result) && (sibling.certificate.treecompensation.usedLifetime + sibling.co2 !== certificate.certificate.treecompensation.usedLifetime)) result = false;
        if((result) && (sibling.certificate.issueDate > certificate.certificate.issueDate)) result = false;
        if((result) && (!await parent._chainValidation(sibling))) result = false;
    } else {
      if((result) && (certificate.certificate.treecompensation.usedLifetime !== 0)) result = false;
    }
    return result;
  }

  this._rootValidation = async function(certificate) {
    let result = true;
    if((result) && (typeof certificate.issueDate == 'undefined'))  result=false;
    if((result) && (certificate.issueDate > new Date().getTime())) result=false;
    if((result) && (typeof certificate.lifeTimeCO2 == 'undefined'))  result=false;
    if((result) && (typeof certificate.treecompensation == 'undefined'))  result=false;
    if((result) && (typeof certificate.issuer == 'undefined'))  result=false;
    if((result) && (typeof certificate.issuersId == 'undefined')) result=false;
    if((result) && (typeof certificate.lifeTime == 'undefined')) result=false;
    return result;
  }

  this._rootChainValidation = async function(root,certificate) {
    let result = false;
    for(let i=0;i<root.treecompensation.uses.length;i++) {
      if(root.treecompensation.uses[i].compensation == certificate.compensation) {
          result = true;
          if((result) && (root.treecompensation.uses[i].co2 !== certificate.co2)) result=false;
          if((result) && (root.treecompensation.uses[i].nonce !== certificate.nonce)) result=false;
      }
    }
    return result;
  }

  this._validation = async function(certificate) {
    let result = true;
    if((result) && (!await parent._innerValidation(certificate))) result = false;
    if((result) && (!await parent._chainValidation(certificate))) result = false;
    const rootCertificate = await parent.getRootCertificate(certificate.certificate.tree);
    if((result) && (!await parent._rootValidation(rootCertificate))) result = false;
    if((result) && (!await parent._rootChainValidation(rootCertificate,certificate))) result = false;
    return result;
  }

  this.getCertificate = async function(certificateId) {
    const storage = await parent._storage();
    let certificate = await storage.getItem(certificateId);
    if(certificate == null) {
      certificate = await parent._fetch(certificateId);
      if((typeof certificate.compensation !== 'undefined') && ( certificate.compensation == certificateId) && (await parent._innerValidation(certificate))) {
        await storage.setItem(certificateId,certificate);
      }
    }
    return certificate;
  }

  this.getRootCertificate = async function(certificateId) {
    const storage = await parent._storage();
    let certificate = await storage.getItem(certificateId);
    if(certificate == null) {
      certificate = await parent._fetchRoot(certificateId);
      if((typeof certificate.tree !== 'undefined') && (await parent._rootValidation(certificate))) {
        await storage.setItem(certificateId,certificate);
      }
    }
    return certificate;
  }

  this.innerValidation = async function(certificate) {
    if(typeof certificate !== 'object') {
      certificate = await parent.getCertificate(certificate);
    }
    return await parent._innerValidation(certificate);
  }

  this.chainValidation = async function(certificate) {
    if(typeof certificate !== 'object') {
      certificate = await parent.getCertificate(certificate);
    }
    return await parent._chainValidation(certificate);
  }

  this.validation = async function(certificate) {
    if(typeof certificate !== 'object') {
      certificate = await parent.getCertificate(certificate);
    }
    return await parent._validation(certificate);
  }

  return this;
}

module.exports = validator;
module.exports.default = validator;
