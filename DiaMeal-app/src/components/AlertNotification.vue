<script setup>
const props = defineProps(['formSuccessMessage', 'formErrorMessage']);
</script>

<template>
  <div class="alert-container">
    <v-alert
      v-if="props.formSuccessMessage"
      :text="props.formSuccessMessage"
      title="Success!"
      type="success"
      variant="elevated"
      density="comfortable"
      style="font-family: 'Syne', sans-serif;"
      border="start"
      class="diameal-alert success-alert"
      closable
    ></v-alert>

    <v-alert
      v-if="props.formErrorMessage"
      :text="props.formErrorMessage"
      title="Oops!"
      type="error"
      variant="elevated"
      density="comfortable"
      style="font-family: 'Syne', sans-serif;"
      border="start"
      class="diameal-alert error-alert"
      closable
    ></v-alert>
  </div>
</template>


<style scoped>
.alert-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 500px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
}

.diameal-alert {
  font-weight: 500;
  font-size: 16px;
  border-radius: 12px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.success-alert {
  background: linear-gradient(135deg, #5d8736, #5d8736);
  color: #fff;
}

.error-alert {
  background: linear-gradient(135deg, #ff6b6b, #ff6b6b);
  color: #fff;
}

</style>

